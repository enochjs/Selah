import type { AudioTrack, RepeatMode } from "./models";
import { nextTrackIndex } from "./playback";
export interface AudioPort {
  replace(source: AudioTrack["source"]): void;
  seekTo(time: number): Promise<void>;
  play(): void;
  pause(): void;
  configure(settings: { volume: number; rate: number; loop: boolean }): void;
  readonly currentTime: number;
}
export interface PlaybackStatus {
  currentTime: number;
  playing: boolean;
  didJustFinish?: boolean;
  error?: string | null;
}
function sourceKey(source: AudioTrack["source"]): string {
  return typeof source === "number" ? `asset:${source}` : source.uri;
}
export function trackDuration(
  track: AudioTrack | null,
  mediaDuration = 0,
): number {
  return track?.endTime !== undefined
    ? Math.max(0, track.endTime - (track.startTime ?? 0))
    : track?.duration || mediaDuration;
}
export function trackPosition(
  track: AudioTrack | null,
  absolute: number,
): number {
  return Math.max(
    0,
    Math.min(
      absolute - (track?.startTime ?? 0),
      trackDuration(track) || Infinity,
    ),
  );
}
/** One physical player, with verse ranges over a shared chapter MP3.
 * Request generations prevent a late seek from restarting an obsolete verse.
 */
export class AudioSession {
  queue: AudioTrack[] = [];
  index = 0;
  transitioning = false;
  private request = 0;
  private source: string | null = null;
  private repeat: RepeatMode = "off";
  private volume = 0.8;
  private rate = 1;
  private wantsPlayback = false;
  private ended = false;
  constructor(
    private port: AudioPort,
    private changed: (queue: AudioTrack[], index: number) => void,
    private error: (message: string) => void,
  ) {}
  get track(): AudioTrack | null {
    return this.queue[this.index] ?? null;
  }
  configure(settings: {
    repeat?: RepeatMode;
    volume?: number;
    rate?: number;
  }): void {
    if (settings.repeat !== undefined) this.repeat = settings.repeat;
    if (settings.volume !== undefined) this.volume = settings.volume;
    if (settings.rate !== undefined) this.rate = settings.rate;
    this.applySettings();
  }
  private applySettings(): void {
    this.port.configure({
      volume: this.volume,
      rate: this.rate,
      loop: this.repeat === "verse" && this.track?.endTime === undefined,
    });
  }
  async playQueue(queue: AudioTrack[], index = 0): Promise<void> {
    const track = queue[index];
    if (!track) return;
    const generation = ++this.request;
    this.transitioning = true;
    this.wantsPlayback = true;
    this.ended = false;
    this.port.pause();
    this.queue = queue;
    this.index = index;
    this.changed(queue, index);
    try {
      const key = sourceKey(track.source);
      if (key !== this.source) {
        this.port.replace(track.source);
        this.source = key;
      }
      this.applySettings();
      await this.port.seekTo(track.startTime ?? 0);
      if (generation !== this.request) return;
      this.transitioning = false;
      this.port.play();
    } catch (error) {
      if (generation !== this.request) return;
      this.transitioning = false;
      this.wantsPlayback = false;
      this.source = null;
      this.error(
        error instanceof Error ? error.message : "Unable to play audio",
      );
    }
  }
  pause(): void {
    this.request++;
    this.wantsPlayback = false;
    this.transitioning = false;
    this.port.pause();
  }
  async resume(): Promise<void> {
    const track = this.track;
    if (!track) return;
    if (
      this.ended ||
      this.transitioning ||
      (track.endTime !== undefined &&
        this.port.currentTime >= track.endTime - 0.02)
    ) {
      await this.playQueue(this.queue, this.index);
      return;
    }
    this.wantsPlayback = true;
    this.port.play();
  }
  async next(): Promise<void> {
    const next = nextTrackIndex(
      this.index,
      this.queue.length,
      this.repeat === "verse" ? "off" : this.repeat,
    );
    if (next !== null) await this.playQueue(this.queue, next);
  }
  async previous(): Promise<void> {
    if (trackPosition(this.track, this.port.currentTime) > 3)
      await this.playQueue(this.queue, this.index);
    else await this.playQueue(this.queue, Math.max(0, this.index - 1));
  }
  async seek(relative: number): Promise<void> {
    const track = this.track;
    if (!track) return;
    await this.port.seekTo(
      (track.startTime ?? 0) +
        Math.max(0, Math.min(relative, trackDuration(track) || Infinity)),
    );
  }
  async onStatus(status: PlaybackStatus): Promise<void> {
    if (status.error) {
      this.pause();
      this.source = null;
      this.error(status.error);
      return;
    }
    const track = this.track;
    if (!this.wantsPlayback || this.transitioning || !track) return;
    const crossedBoundary =
      track.endTime !== undefined &&
      status.playing &&
      status.currentTime >= track.endTime - 0.015;
    if (!crossedBoundary && !status.didJustFinish) return;
    const next = nextTrackIndex(this.index, this.queue.length, this.repeat);
    if (next === null) {
      this.ended = true;
      this.pause();
      return;
    }
    const following = this.queue[next];
    if (
      crossedBoundary &&
      next === this.index + 1 &&
      sourceKey(following.source) === sourceKey(track.source)
    ) {
      this.index = next;
      this.changed(this.queue, next);
      return;
    }
    await this.playQueue(this.queue, next);
  }
  dispose(): void {
    this.pause();
  }
}
