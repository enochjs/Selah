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
/** Stream the original chapter continuously; loop isolated verse files natively.
 * Request generations prevent a late seek from restarting an obsolete verse.
 */
export class AudioSession {
  queue: AudioTrack[] = [];
  index = 0;
  transitioning = false;
  private request = 0;
  private source: string | null = null;
  private logicalSource: string | null = null;
  private loaded = false;
  private repeat: RepeatMode = "off";
  private volume = 0.8;
  private rate = 1;
  private wantsPlayback = false;
  private ended = false;
  private activeTrack: AudioTrack | null = null;
  private playing = false;
  private pendingPosition = 0;
  constructor(
    private port: AudioPort,
    private changed: (queue: AudioTrack[], index: number) => void,
    private error: (message: string) => void,
    private resolveSource?: (
      source: AudioTrack["source"],
    ) => Promise<AudioTrack["source"]>,
  ) {}
  get track(): AudioTrack | null {
    return this.queue[this.index] ?? null;
  }
  get playbackTrack(): AudioTrack | null {
    return this.activeTrack;
  }
  private playbackFor(track: AudioTrack): AudioTrack {
    return this.repeat !== "verse" && track.chapterAudio
      ? { ...track, ...track.chapterAudio }
      : track;
  }
  configure(settings: {
    repeat?: RepeatMode;
    volume?: number;
    rate?: number;
  }): void {
    if (settings.repeat !== undefined) this.repeat = settings.repeat;
    if (settings.volume !== undefined) this.volume = settings.volume;
    if (settings.rate !== undefined) this.rate = settings.rate;
    if (
      this.track &&
      this.activeTrack &&
      sourceKey(this.playbackFor(this.track).source) !== this.logicalSource
    ) {
      const position = this.ended
        ? 0
        : this.transitioning
          ? this.pendingPosition
          : trackPosition(this.activeTrack, this.port.currentTime);
      const autoplay =
        this.wantsPlayback && (this.playing || this.transitioning);
      void this.select(this.queue, this.index, position, autoplay);
      return;
    }
    this.applySettings();
  }
  private applySettings(): void {
    this.port.configure({
      volume: this.volume,
      rate: this.rate,
      loop: this.repeat === "verse" && this.activeTrack?.endTime === undefined,
    });
  }
  async playQueue(queue: AudioTrack[], index = 0): Promise<void> {
    await this.select(queue, index);
  }
  private async select(
    queue: AudioTrack[],
    index: number,
    position = 0,
    autoplay = true,
  ): Promise<void> {
    const track = queue[index];
    if (!track) return;
    const generation = ++this.request;
    this.transitioning = true;
    this.wantsPlayback = autoplay;
    this.playing = false;
    this.ended = false;
    this.port.pause();
    this.queue = queue;
    this.index = index;
    const playback = this.playbackFor(track);
    this.activeTrack = playback;
    this.logicalSource = sourceKey(playback.source);
    this.pendingPosition = position;
    this.loaded = false;
    this.changed(queue, index);
    try {
      const source = this.resolveSource
        ? await this.resolveSource(playback.source)
        : playback.source;
      if (generation !== this.request) return;
      this.activeTrack = { ...playback, source };
      this.logicalSource = sourceKey(playback.source);
      const key = sourceKey(source);
      if (key !== this.source) {
        this.port.replace(source);
        this.source = key;
      }
      this.applySettings();
      const duration = trackDuration(playback);
      const relative =
        duration && position >= duration - 0.02 ? 0 : Math.max(0, position);
      this.pendingPosition = relative;
      await this.port.seekTo((playback.startTime ?? 0) + relative);
      if (generation !== this.request) return;
      this.transitioning = false;
      this.loaded = true;
      if (autoplay) {
        this.port.play();
        this.playing = true;
      }
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
    this.playing = false;
    this.transitioning = false;
    this.port.pause();
  }
  async resume(): Promise<void> {
    const track = this.activeTrack;
    if (!track) return;
    if (!this.loaded) {
      await this.select(this.queue, this.index, this.pendingPosition);
      return;
    }
    if (
      this.ended ||
      this.transitioning ||
      (track.endTime !== undefined &&
        this.port.currentTime >= track.endTime - 0.02 &&
        !(this.repeat !== "verse" && this.track?.chapterAudio))
    ) {
      await this.playQueue(this.queue, this.index);
      return;
    }
    this.wantsPlayback = true;
    this.port.play();
    this.playing = true;
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
    if (trackPosition(this.activeTrack, this.port.currentTime) > 3)
      await this.playQueue(this.queue, this.index);
    else await this.playQueue(this.queue, Math.max(0, this.index - 1));
  }
  async seek(relative: number): Promise<void> {
    const track = this.activeTrack;
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
    let track = this.activeTrack;
    if (!this.wantsPlayback || this.transitioning || !track) return;
    this.playing = status.playing;
    // Isolated verse files loop in the native player, including in background.
    if (this.repeat === "verse" && track.endTime === undefined) return;
    // Native status delivery may be delayed in the background. Catch up to the
    // spoken verse before handling EOF; never seek back through heard verses.
    const previousIndex = this.index;
    while (
      this.repeat !== "verse" &&
      (status.playing || status.didJustFinish) &&
      this.index + 1 < this.queue.length
    ) {
      const following = this.playbackFor(this.queue[this.index + 1]);
      if (
        track.endTime === undefined ||
        following.startTime === undefined ||
        sourceKey(following.source) !== this.logicalSource ||
        status.currentTime <
          Math.max(track.endTime, following.startTime) - 0.015
      )
        break;
      this.index++;
      this.activeTrack = track = { ...following, source: track.source };
    }
    if (this.index !== previousIndex) this.changed(this.queue, this.index);
    const next = nextTrackIndex(this.index, this.queue.length, this.repeat);
    const following = next === null ? null : this.playbackFor(this.queue[next]);
    const continuousBoundary =
      next === this.index + 1 &&
      following !== null &&
      track.endTime !== undefined &&
      following.startTime !== undefined &&
      sourceKey(following.source) === this.logicalSource
        ? Math.max(track.endTime, following.startTime)
        : undefined;
    const boundary = continuousBoundary ?? track.endTime;
    const crossedBoundary =
      boundary !== undefined &&
      status.playing &&
      status.currentTime >= boundary - 0.015;
    if (!crossedBoundary && !status.didJustFinish) return;
    if (next === null) {
      this.ended = true;
      this.pause();
      return;
    }
    await this.playQueue(this.queue, next);
  }
  dispose(): void {
    this.pause();
  }
}
