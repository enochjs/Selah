import type { AudioPlayer } from "expo-audio";
import type {
  AudioPort,
  LoopRange,
  PlaybackStatus,
} from "../../domain/audio-session";
import type { AudioTrack } from "../../domain/models";
import { configurePlayer } from "./audio-engine";

export interface RangeBackend {
  setRange(
    player: AudioPlayer,
    start: number | null,
    end: number | null,
  ): Promise<number>;
  setPlaying(player: AudioPlayer, playing: boolean): void;
}

/** Keep the domain clock in original-chapter seconds. Media3 clipped windows
 * report time relative to their start; AVPlayer keeps the original time base.
 */
export class RangePlayback implements AudioPort {
  private offset = 0;
  private revision = 0;
  private rangeActive = false;
  readonly handlesLoopRange: boolean;
  constructor(
    private player: AudioPlayer,
    private backend?: RangeBackend,
  ) {
    this.handlesLoopRange = backend !== undefined;
  }
  get currentTime(): number {
    return this.player.currentTime + this.offset;
  }
  replace(source: AudioTrack["source"]): void {
    this.offset = 0;
    this.player.replace(source);
  }
  seekTo(time: number): Promise<void> {
    return this.player.seekTo(Math.max(0, time - this.offset), 0, 0);
  }
  configure(settings: { volume: number; rate: number; loop: boolean }): void {
    // Media3 owns REPEAT_MODE_ONE while clipped. Applying Expo's whole-file
    // loop=false on a volume/rate change would silently disable range looping.
    configurePlayer(
      this.player,
      this.rangeActive
        ? { volume: settings.volume, rate: settings.rate }
        : settings,
    );
  }
  async setLoopRange(range: LoopRange | null): Promise<void> {
    if (!this.backend) return;
    const revision = ++this.revision;
    this.rangeActive = range !== null;
    const offset = await this.backend.setRange(
      this.player,
      range?.startTime ?? null,
      range?.endTime ?? null,
    );
    if (revision === this.revision) this.offset = offset;
  }
  play(): void {
    this.backend?.setPlaying(this.player, true);
    this.player.play();
  }
  pause(): void {
    this.backend?.setPlaying(this.player, false);
    this.player.pause();
  }
  status(status: PlaybackStatus): PlaybackStatus {
    return { ...status, currentTime: status.currentTime + this.offset };
  }
  dispose(): void {
    void this.setLoopRange(null).catch(() => {});
  }
}
