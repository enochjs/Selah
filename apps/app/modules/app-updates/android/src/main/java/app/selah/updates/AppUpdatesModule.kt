package app.selah.updates

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.coroutines.launch
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicBoolean

class UpdateFileProvider : FileProvider()

/** Only digest-addressed private files can be downloaded or handed to the installer. */
class AppUpdatesModule : Module() {
  private val active = ConcurrentHashMap<String, AtomicBoolean>()
  private val connections = ConcurrentHashMap<String, HttpURLConnection>()
  private val lock = Any()
  private val pendingCancellations = ConcurrentHashMap.newKeySet<String>()
  private val context get() = appContext.reactContext ?: error("unavailable: context lost")
  private fun problem(code: String, message: String): Nothing = error("$code: $message")
  private fun directory(): File = File(context.filesDir, "app-updates").also {
    if (!it.exists() && !it.mkdirs()) problem("storage", "cannot create update directory")
  }
  private data class Spec(val hash: String, val size: Long, val url: String, val appId: String, val version: String, val build: Long, val requestId: String)
  private fun spec(raw: Map<String, Any>): Spec {
    val hash = raw["sha256"] as? String ?: problem("integrity", "missing digest")
    if (!hash.matches(Regex("[a-f0-9]{64}"))) problem("integrity", "invalid digest")
    val size = (raw["size"] as? Number)?.toLong() ?: 0L
    val build = (raw["buildNumber"] as? Number)?.toLong() ?: 0L
    val url = raw["url"] as? String ?: ""
    val parsed = try { URL(url) } catch (_: Exception) { problem("integrity", "invalid URL") }
    if (size <= 0 || build <= 0 || parsed.protocol != "https" || parsed.userInfo != null || parsed.query != null || parsed.ref != null || parsed.path != "/api/app-updates/artifacts/$hash.apk") problem("integrity", "invalid artifact")
    val appId = raw["appId"] as? String ?: ""
    if (appId != context.packageName) problem("incompatible", "package identity mismatch")
    return Spec(hash, size, url, appId, raw["version"] as? String ?: "", build, raw["requestId"] as? String ?: "")
  }
  private fun file(spec: Spec, partial: Boolean = false) = File(directory(), spec.hash + if (partial) ".part" else ".apk")
  @Suppress("DEPRECATION")
  private fun signatureFlags(): Int = if (Build.VERSION.SDK_INT >= 28) PackageManager.GET_SIGNING_CERTIFICATES else PackageManager.GET_SIGNATURES
  @Suppress("DEPRECATION")
  private fun installedPackage(): PackageInfo = context.packageManager.getPackageInfo(context.packageName, signatureFlags())
  @Suppress("DEPRECATION")
  private fun build(info: PackageInfo): Long = if (Build.VERSION.SDK_INT >= 28) info.longVersionCode else info.versionCode.toLong()
  @Suppress("DEPRECATION")
  private fun signers(info: PackageInfo): Set<String> {
    val signatures = if (Build.VERSION.SDK_INT >= 28) info.signingInfo?.apkContentsSigners else info.signatures
    return signatures?.map { signature -> digest(signature.toByteArray()) }?.toSet() ?: emptySet()
  }
  private fun digest(bytes: ByteArray) = MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }
  @Suppress("DEPRECATION")
  private fun verify(spec: Spec, candidate: File): Boolean {
    if (!candidate.isFile || candidate.length() != spec.size) return false
    val hash = MessageDigest.getInstance("SHA-256")
    candidate.inputStream().buffered().use { stream ->
      val buffer = ByteArray(64 * 1024)
      while (true) { val count = stream.read(buffer); if (count < 0) break; hash.update(buffer, 0, count) }
    }
    if (hash.digest().joinToString("") { "%02x".format(it) } != spec.hash) return false
    val archive = context.packageManager.getPackageArchiveInfo(candidate.absolutePath, signatureFlags()) ?: return false
    val current = installedPackage()
    val currentSigners = signers(current)
    if (archive.packageName != spec.appId || build(archive) != spec.build || archive.versionName != spec.version || spec.build <= build(current)) return false
    // Require the exact current signer set; do not weaken this to any old lineage certificate.
    return currentSigners.isNotEmpty() && signers(archive) == currentSigners
  }
  private fun recover(spec: Spec): Boolean {
    val candidate = file(spec)
    if (!candidate.exists()) return false
    if (verify(spec, candidate)) return true
    candidate.delete()
    return false
  }
  private fun download(spec: Spec) {
    if (spec.requestId.isEmpty()) problem("integrity", "missing transfer identity")
    val cancelled: AtomicBoolean
    synchronized(lock) {
      if (active.isNotEmpty()) problem("unavailable", "another download is active")
      cancelled = AtomicBoolean(pendingCancellations.remove(spec.requestId))
      active[spec.requestId] = cancelled
    }
    try {
      if (cancelled.get()) problem("cancelled", "download paused")
      if (recover(spec)) { sendEvent("onProgress", mapOf("sha256" to spec.hash, "bytes" to spec.size)); return }
      val part = file(spec, true)
      if (part.length() > spec.size) part.delete()
      if (part.length() == spec.size) {
        if (verify(spec, part)) { if (!part.renameTo(file(spec))) problem("storage", "cannot publish file"); return }
        part.delete()
      }
      var offset = part.length()
      val connection = URL(spec.url).openConnection() as HttpURLConnection
      connections[spec.requestId] = connection
      connection.instanceFollowRedirects = false
      connection.connectTimeout = 15000
      connection.readTimeout = 20000
      connection.setRequestProperty("Accept-Encoding", "identity")
      if (offset > 0) {
        connection.setRequestProperty("Range", "bytes=$offset-")
        connection.setRequestProperty("If-Range", "\"${spec.hash}\"")
      }
      if (cancelled.get()) problem("cancelled", "download paused")
      val status = connection.responseCode
      if (status == 404 || status == 410) problem("unavailable", "release withdrawn")
      if (status != 200 && status != 206) problem("network", "download response rejected")
      if (status == 206) {
        val range = connection.getHeaderField("Content-Range") ?: ""
        val match = Regex("bytes (\\d+)-(\\d+)/(\\d+)").matchEntire(range)
        if (match == null || match.groupValues[1].toLongOrNull() != offset || match.groupValues[2].toLongOrNull() != spec.size - 1 || match.groupValues[3].toLongOrNull() != spec.size) problem("integrity", "invalid partial response")
      } else offset = 0
      val length = connection.getHeaderFieldLong("Content-Length", -1)
      if (length >= 0 && length != spec.size - offset) problem("integrity", "invalid response size")
      val etag = connection.getHeaderField("ETag")
      if (etag != null && etag != "\"${spec.hash}\"") problem("integrity", "artifact identity changed")
      if (directory().usableSpace < spec.size - offset + 1024 * 1024) problem("storage", "insufficient space")
      var completed = offset
      var lastEvent = 0L
      connection.inputStream.buffered().use { input ->
        java.io.FileOutputStream(part, offset > 0).use { output ->
          val buffer = ByteArray(64 * 1024)
          while (true) {
            if (cancelled.get()) problem("cancelled", "download paused")
            val count = input.read(buffer)
            if (count < 0) break
            if (completed + count > spec.size) problem("integrity", "artifact exceeds expected size")
            output.write(buffer, 0, count); completed += count
            val now = System.currentTimeMillis()
            if (now - lastEvent >= 200) { sendEvent("onProgress", mapOf("sha256" to spec.hash, "bytes" to completed)); lastEvent = now }
          }
          output.fd.sync()
        }
      }
      if (cancelled.get()) problem("cancelled", "download paused")
      if (completed != spec.size) problem("network", "incomplete download")
      if (!verify(spec, part)) { part.delete(); problem("integrity", "artifact verification failed") }
      if (!part.renameTo(file(spec))) problem("storage", "cannot publish file")
      sendEvent("onProgress", mapOf("sha256" to spec.hash, "bytes" to spec.size))
    } catch (error: IOException) {
      if (cancelled.get()) problem("cancelled", "download paused")
      if (error is java.io.FileNotFoundException || error.message?.contains("ENOSPC") == true) problem("storage", "file unavailable")
      problem("network", "connection interrupted")
    } finally { connections.remove(spec.requestId)?.disconnect(); active.remove(spec.requestId) }
  }
  override fun definition() = ModuleDefinition {
    Name("SelahAppUpdates")
    Events("onProgress")
    Function("installed") {
      val info = installedPackage()
      val installer = try {
        if (Build.VERSION.SDK_INT >= 30) context.packageManager.getInstallSourceInfo(context.packageName).installingPackageName
        else context.packageManager.getInstallerPackageName(context.packageName)
      } catch (_: SecurityException) { null }
        catch (_: PackageManager.NameNotFoundException) { null }
      mapOf("platform" to "android", "channel" to (if (installer == "com.android.vending") "store" else "direct"), "appId" to info.packageName, "version" to (info.versionName ?: ""), "buildNumber" to build(info))
    }
    AsyncFunction("recover") Coroutine { raw: Map<String, Any> -> withContext(Dispatchers.IO) { recover(spec(raw)) } }
    AsyncFunction("download") Coroutine { raw: Map<String, Any> -> withContext(Dispatchers.IO) { download(spec(raw)) } }
    Function("cancel") { requestId: String ->
      synchronized(lock) {
        val transfer = active[requestId]
        if (transfer == null) pendingCancellations.add(requestId) else transfer.set(true)
      }
      connections[requestId]?.let { connection ->
        appContext.backgroundCoroutineScope.launch(Dispatchers.IO) { connection.disconnect() }
      }
    }
    AsyncFunction("install") Coroutine { raw: Map<String, Any> ->
      val spec = withContext(Dispatchers.IO) {
        spec(raw).also { if (!recover(it)) problem("integrity", "verified APK unavailable") }
      }
      withContext(Dispatchers.Main) {
      if (Build.VERSION.SDK_INT >= 26 && !context.packageManager.canRequestPackageInstalls()) "permission"
      else {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.app-updates", file(spec))
        val intent = Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_GRANT_READ_URI_PERMISSION)
        try { context.startActivity(intent) } catch (_: android.content.ActivityNotFoundException) { problem("unavailable", "system installer unavailable") }
        "opened"
      }
      }
    }
    AsyncFunction("openPermissionSettings") Coroutine { ->
      withContext(Dispatchers.Main) {
      if (Build.VERSION.SDK_INT >= 26) {
        context.startActivity(Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
      }
      }
    }
    OnDestroy { active.values.forEach { it.set(true) }; connections.values.forEach { it.disconnect() } }
  }
}
