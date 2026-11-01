import AVFoundation
import ExpoModulesCore

public final class AudioRangesModule: Module {
  private var loops: [ObjectIdentifier: ChapterLoop] = [:]

  public func definition() -> ModuleDefinition {
    Name("SelahAudioRanges")

    AsyncFunction("setRange") { (shared: SharedRef<AVPlayer>, start: Double?, end: Double?) -> Double in
      let player = shared.ref
      let key = ObjectIdentifier(player)
      self.loops.removeValue(forKey: key)?.clear()
      if let start, let end {
        guard start.isFinite, end.isFinite, start >= 0, end > start,
          player.currentItem != nil else {
          throw NSError(domain: "SelahAudioRanges", code: 1,
            userInfo: [NSLocalizedDescriptionKey: "Invalid chapter loop range"])
        }
        self.loops[key] = ChapterLoop(player: player, start: start, end: end)
      }
      return 0
    }.runOnQueue(.main)

    Function("setPlaying") { (shared: SharedRef<AVPlayer>, playing: Bool) in
      // Expo's synchronous functions can be called on the JS thread.
      DispatchQueue.main.async { [weak self, weak player = shared.ref] in
        guard let player else { return }
        self?.loops[ObjectIdentifier(player)]?.setPlaying(playing)
      }
    }

    OnDestroy {
      DispatchQueue.main.async { [weak self] in
        self?.loops.values.forEach { $0.clear() }
        self?.loops.removeAll()
      }
    }
  }
}
