import AVFoundation
#if os(iOS)
import MediaPlayer
#endif

/// AVPlayer stops decoding at the verified end time. The native end notification
/// seeks back with zero tolerance, even when the JavaScript runtime is suspended.
/// All methods and callbacks run on the main queue.
final class ChapterLoop {
  private weak var player: AVPlayer?
  private weak var item: AVPlayerItem?
  private let start: CMTime
  private let end: CMTime
  private var rate: Float = 1
  private var wantsPlayback = false
  private var revision = 0
  private var notification: NSObjectProtocol?
  private var rateObservation: NSKeyValueObservation?
#if os(iOS)
  private var interruption: NSObjectProtocol?
  private var remotePause: Any?
#endif

  init(player: AVPlayer, start: Double, end: Double) {
    self.player = player
    self.item = player.currentItem
    self.start = CMTime(seconds: start, preferredTimescale: 1_000_000)
    self.end = CMTime(seconds: end, preferredTimescale: 1_000_000)
    item?.forwardPlaybackEndTime = self.end
    rateObservation = player.observe(\.rate, options: [.new]) { [weak self] player, _ in
      guard let self else { return }
      // Rate changes caused by headphones, lock-screen controls or interruptions
      // must take effect too. At EOF zero is a boundary, rather than user pause.
      if player.rate > 0 {
        self.rate = player.rate
        self.wantsPlayback = true
      } else if player.currentTime() < self.end - CMTime(seconds: 0.02, preferredTimescale: 1_000_000) {
        self.wantsPlayback = false
        self.revision += 1
      }
    }
    notification = NotificationCenter.default.addObserver(
      forName: .AVPlayerItemDidPlayToEndTime, object: item, queue: .main
    ) { [weak self] _ in self?.repeatRange() }
#if os(iOS)
    interruption = NotificationCenter.default.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: .main
    ) { [weak self] event in
      if event.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt == AVAudioSession.InterruptionType.began.rawValue {
        self?.setPlaying(false)
      }
    }
    // Pause may arrive during the zero-rate seek between repetitions. Rate KVO
    // alone cannot observe that pause because the player's rate is already zero.
    remotePause = MPRemoteCommandCenter.shared().pauseCommand.addTarget { [weak self] _ in
      DispatchQueue.main.async { self?.setPlaying(false) }
      return .success
    }
#endif
  }

  func setPlaying(_ playing: Bool) {
    wantsPlayback = playing
    if !playing { revision += 1 }
  }

  private func repeatRange() {
    guard wantsPlayback, let player, player.currentItem === item else { return }
    let request = revision
    player.seek(to: start, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] finished in
      DispatchQueue.main.async {
        guard let self, finished, self.wantsPlayback, self.revision == request,
          let player = self.player, player.currentItem === self.item else { return }
        player.playImmediately(atRate: self.rate)
      }
    }
  }

  func clear() {
    setPlaying(false)
    if let notification { NotificationCenter.default.removeObserver(notification) }
    notification = nil
    rateObservation?.invalidate()
    rateObservation = nil
#if os(iOS)
    if let interruption { NotificationCenter.default.removeObserver(interruption) }
    interruption = nil
    if let remotePause { MPRemoteCommandCenter.shared().pauseCommand.removeTarget(remotePause) }
    remotePause = nil
#endif
    item?.forwardPlaybackEndTime = .invalid
  }

  deinit { clear() }
}
