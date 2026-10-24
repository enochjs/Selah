package app.selah.downloads

import android.content.Intent
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.exception.Exceptions

class BackgroundDownloadsModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SelahBackgroundDownloads")
    Events("onPause")

    OnCreate {
      BackgroundDownloadService.onPauseDownloads = { sendEvent("onPause") }
    }
    OnDestroy {
      BackgroundDownloadService.onPauseDownloads = null
      appContext.reactContext?.let {
        it.stopService(Intent(it, BackgroundDownloadService::class.java))
      }
    }
    Function("update") { completed: Int, total: Int, percent: Int, waiting: Boolean ->
      val context = appContext.reactContext ?: throw Exceptions.ReactContextLost()
      val intent = Intent(context, BackgroundDownloadService::class.java)
        .putExtra("completed", completed)
        .putExtra("total", total)
        .putExtra("percent", percent)
        .putExtra("waiting", waiting)
      if (android.os.Build.VERSION.SDK_INT >= 26) context.startForegroundService(intent)
      else context.startService(intent)
    }
    Function("stop") {
      appContext.reactContext?.let {
        it.stopService(Intent(it, BackgroundDownloadService::class.java))
      }
    }
  }
}
