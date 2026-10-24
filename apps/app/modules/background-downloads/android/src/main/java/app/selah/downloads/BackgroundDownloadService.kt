package app.selah.downloads

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager

/** Protect the existing verified download queue while its React runtime is backgrounded. */
class BackgroundDownloadService : Service() {
  companion object {
    private const val CHANNEL = "selah-offline-downloads"
    private const val NOTIFICATION = 23001
    private const val PAUSE = "app.selah.downloads.PAUSE"
    var onPauseDownloads: (() -> Unit)? = null
  }
  private var wakeLock: PowerManager.WakeLock? = null

  override fun onCreate() {
    super.onCreate()
    if (Build.VERSION.SDK_INT >= 26) {
      val chinese = resources.configuration.locales[0].language == "zh"
      getSystemService(NotificationManager::class.java).createNotificationChannel(
        NotificationChannel(CHANNEL, if (chinese) "离线音频下载" else "Offline audio downloads", NotificationManager.IMPORTANCE_LOW)
      )
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent == null || onPauseDownloads == null) {
      stopSelf()
      return START_NOT_STICKY
    }
    if (intent.action == PAUSE) {
      onPauseDownloads?.invoke()
      stopSelf()
      return START_NOT_STICKY
    }
    val chinese = resources.configuration.locales[0].language == "zh"
    val completed = intent.getIntExtra("completed", 0)
    val total = intent.getIntExtra("total", 0)
    val percent = intent.getIntExtra("percent", 0).coerceIn(0, 100)
    val waiting = intent.getBooleanExtra("waiting", false)
    val open = Intent(Intent.ACTION_VIEW, Uri.parse("selah://downloads")).setPackage(packageName)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    val immutable = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    val content = PendingIntent.getActivity(this, 23001, open, immutable)
    val pause = PendingIntent.getService(this, 23002,
      Intent(this, BackgroundDownloadService::class.java).setAction(PAUSE), immutable)
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else Notification.Builder(this)
    val notification = builder
      .setSmallIcon(android.R.drawable.stat_sys_download)
      .setContentTitle(if (chinese) "Selah · 离线音频下载" else "Selah · Downloading audio")
      .setContentText(if (waiting) {
        if (chinese) "等待符合设置的网络 · $completed / $total 章" else "Waiting for network · $completed / $total chapters"
      } else {
        if (chinese) "$completed / $total 章 · $percent%" else "$completed / $total chapters · $percent%"
      })
      .setProgress(100, percent, waiting)
      .setContentIntent(content)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setCategory(Notification.CATEGORY_PROGRESS)
      .addAction(Notification.Action.Builder(null, if (chinese) "暂停下载" else "Pause", pause).build())
      .build()
    if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
    else startForeground(NOTIFICATION, notification)
    if (waiting) releaseWakeLock()
    else if (wakeLock?.isHeld != true) {
      wakeLock = (getSystemService(POWER_SERVICE) as PowerManager)
        .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "Selah:OfflineDownloads")
        .apply { acquire(6 * 60 * 60 * 1000L) }
    }
    return START_NOT_STICKY
  }

  override fun onTimeout(startId: Int, fgsType: Int) {
    onPauseDownloads?.invoke()
    stopSelf()
  }
  private fun releaseWakeLock() {
    wakeLock?.let { if (it.isHeld) it.release() }
    wakeLock = null
  }
  override fun onDestroy() {
    releaseWakeLock()
    stopForeground(STOP_FOREGROUND_REMOVE)
    super.onDestroy()
  }
  override fun onBind(intent: Intent?): IBinder? = null
}
