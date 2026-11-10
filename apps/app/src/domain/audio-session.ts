import type { AudioTrack, RepeatMode } from "./models";
import { nextTrackIndex } from "./playback";
export interface LoopRange {
  startTime: number;
  endTime: number;
}
export interface AudioPort {
  replace(source: AudioTrack["source"]): void;
  seekTo(time: number): Promise<void>;
  play(): void;
  pause(): void;
  configure(settings: { volume: number; rate: number; loop: boolean }): void;
  readonly handlesLoopRange?: boolean;
  setLoopRange?(range: LoopRange | null): Promise<void>;
  dispose?(): void;
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
/** Stream the original chapter; repeat verified ranges in the playback engine.
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
  private loopRange: LoopRange | null = null;
  private rangeChange: Promise<void> | null = null;
  constructor(
    private port: AudioPort,
    private changed: (queue: AudioTrack[], index: number) => void,
    private error: (message: string) => void,
    private resolveSource?: (
      source: AudioTrack["source"],
    ) => Promise<AudioTrack["source"]>,
    private continueQueue?: (track: AudioTrack) => AudioTrack[],
  ) {}
  get track(): AudioTrack | null {
    return this.queue[this.index] ?? null;
  }
  get playbackTrack(): AudioTrack | null {
    return this.activeTrack;
  }
  get isPlaying(): boolean {
    return this.wantsPlayback && this.playing;
  }
  private playbackFor(track: AudioTrack): AudioTrack {
    return track.chapterAudio ? { ...track, ...track.chapterAudio } : track;
  }
  configure(settings: {
    repeat?: RepeatMode;
    volume?: number;
    rate?: number;
  }): void {
    const previousRepeat = this.repeat;
    if (settings.repeat !== undefined) this.repeat = settings.repeat;
    if (settings.volume !== undefined) this.volume = settings.volume;
    if (settings.rate !== undefined) this.rate = settings.rate;
    if (
      this.track &&
      this.activeTrack &&
      (sourceKey(this.playbackFor(this.track).source) !== this.logicalSource ||
        (previousRepeat === "verse") !== (this.repeat === "verse"))
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
  private updateLoopRange(range: LoopRange | null): Promise<void> | null {
    if (!this.port.setLoopRange) return null;
    if (
      range?.startTime !== this.loopRange?.startTime ||
      range?.endTime !== this.loopRange?.endTime
    ) {
      this.loopRange = range;
      this.rangeChange = this.port.setLoopRange(range);
    }
    // A resumed selection must also await an unchanged but still pending range.
    return this.rangeChange;
  }
  async playQueue(queue: AudioTrack[], index = 0): Promise<void> {
    await this.select(queue, index);
  }
  async switchNarration(queue: AudioTrack[]): Promise<boolean> {
    const current = this.track;
    if (!current || current.kind !== "scripture") return true;
    const index = queue.findIndex(
      (track) =>
        track.kind === "scripture" &&
        track.bookId === current.bookId &&
        track.chapter === current.chapter &&
        current.verse !== undefined &&
        (track.verse === current.verse ||
          track.coveredVerses?.includes(current.verse)),
    );
    if (index < 0) {
      this.pause();
      this.queue = [];
      this.index = 0;
      this.activeTrack = null;
      this.loaded = false;
      this.changed([], 0);
      return false;
    }
    const autoplay = this.wantsPlayback && (this.playing || this.transitioning);
    await this.select(queue, index, 0, autoplay);
    return true;
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
        const clearing = this.updateLoopRange(null);
        if (clearing) {
          await clearing;
          if (generation !== this.request) return;
        }
        this.port.replace(source);
        this.source = key;
      }
      const range =
        this.repeat === "verse" && playback.endTime !== undefined
          ? { startTime: playback.startTime ?? 0, endTime: playback.endTime }
          : null;
      const changingRange = this.updateLoopRange(range);
      if (changingRange) {
        await changingRange;
        if (generation !== this.request) return;
      }
      this.applySettings();
      const duration = trackDuration(playback);
      const relative =
        this.repeat === "verse" && duration && position >= duration - 0.02
          ? 0
          : Math.max(0, position);
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
      this.loaded = false;
      this.wantsPlayback = false;
      this.port.pause();
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
        this.repeat === "verse")
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
  /** An explicit lyric selection resumes at that position, even after EOF. */
  async playFrom(relative: number): Promise<void> {
    if (!this.track || !Number.isFinite(relative)) return;
    const position = Math.max(
      0,
      Math.min(relative, trackDuration(this.activeTrack) || Infinity),
    );
    await this.select(this.queue, this.index, position, true);
  }
  async onStatus(status: PlaybackStatus): Promise<void> {
    if (status.error) {
      if (this.loaded)
        this.pendingPosition = trackPosition(
          this.activeTrack,
          status.currentTime,
        );
      this.loaded = false;
      this.pause();
      this.source = null;
      this.error(status.error);
      return;
    }
    let track = this.activeTrack;
    if (!this.wantsPlayback || this.transitioning || !track) return;
    // Engine-owned ranges continue looping even while JavaScript is suspended.
    if (
      this.repeat === "verse" &&
      (track.endTime === undefined || this.port.handlesLoopRange)
    ) {
      // iOS emits a transient EOF before its native seek completes. It is not
      // an interruption; explicit pauses still clear wantsPlayback themselves.
      if (!status.didJustFinish) this.playing = status.playing;
      return;
    }
    this.playing = status.playing;
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
      if (
        this.repeat === "off" &&
        this.track?.kind === "scripture" &&
        this.continueQueue
      ) {
        // Verse timing can end before the original recording. Let the chapter
        // reach EOF before loading its successor, including unaligned tails.
        if (!status.didJustFinish) return;
        const queue = this.continueQueue(this.track);
        if (queue.length) {
          await this.playQueue(queue);
          return;
        }
      }
      this.ended = true;
      this.pause();
      return;
    }
    await this.playQueue(this.queue, next);
  }
  dispose(): void {
    this.pause();
    this.port.dispose?.();
  }
}
