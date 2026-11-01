package app.selah.audio

import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import expo.modules.kotlin.functions.Queues
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.sharedobjects.SharedRef

/** Reuse expo-audio's player/session, but let Media3 enforce decoded boundaries.
 * Clipped windows have a relative clock; return its origin to the JS adapter.
 */
@androidx.annotation.OptIn(androidx.media3.common.util.UnstableApi::class)
class AudioRangesModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SelahAudioRanges")

    AsyncFunction("setRange") { shared: SharedRef<ExoPlayer>, start: Double?, end: Double? ->
      val player = shared.ref
      require((start == null && end == null) ||
        (start != null && end != null && start.isFinite() && end.isFinite() && start >= 0 && end > start))
      val current = player.currentMediaItem
      if (current == null) {
        check(start == null) { "No chapter audio loaded" }
        return@AsyncFunction 0.0
      }
      val startUs = if (start == null) 0L else (start * 1_000_000).toLong()
      val endUs = if (end == null) C.TIME_END_OF_SOURCE else (end * 1_000_000).toLong()
      val clipping = MediaItem.ClippingConfiguration.Builder()
        .setStartPositionUs(startUs)
        .setEndPositionUs(endUs)
        .setStartsAtKeyFrame(false)
        .build()
      player.pause()
      player.repeatMode = if (start == null) Player.REPEAT_MODE_OFF else Player.REPEAT_MODE_ONE
      player.setMediaItem(current.buildUpon().setClippingConfiguration(clipping).build())
      player.prepare()
      start ?: 0.0
    }.runOnQueue(Queues.MAIN)

    // iOS uses this to distinguish an explicit pause from reaching its end time.
    Function("setPlaying") { _: SharedRef<ExoPlayer>, _: Boolean -> Unit }
  }
}
