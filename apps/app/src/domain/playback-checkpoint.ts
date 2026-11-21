import type { AudioTrack, RepeatMode } from "./models";
import { trackDuration } from "./audio-session";
export type TrackIdentity = Pick<
  AudioTrack,
  "id" | "kind" | "bookId" | "chapter" | "locale"
>;
export interface PlaybackCheckpoint {
  version: 1;
  buildNumber: number;
  queue: TrackIdentity[];
  index: number;
  position: number;
  rate: number;
  volume: number;
  repeat: RepeatMode;
}
export function createPlaybackCheckpoint(
  buildNumber: number,
  queue: AudioTrack[],
  index: number,
  position: number,
  settings: Pick<PlaybackCheckpoint, "rate" | "volume" | "repeat">,
): PlaybackCheckpoint {
  return {
    version: 1,
    buildNumber,
    queue: queue.map(({ id, kind, bookId, chapter, locale }) => ({
      id,
      kind,
      bookId,
      chapter,
      locale,
    })),
    index,
    position,
    ...settings,
  };
}
export function restorePlaybackCheckpoint(
  value: unknown,
  buildNumber: number,
  resolve: (identity: TrackIdentity) => AudioTrack | null,
):
  | { status: "invalid" | "unchanged" | "unavailable" }
  | {
      status: "ready";
      queue: AudioTrack[];
      index: number;
      position: number;
      settings: Pick<PlaybackCheckpoint, "rate" | "volume" | "repeat">;
    } {
  if (!value || typeof value !== "object") return { status: "invalid" };
  const c = value as PlaybackCheckpoint;
  if (
    c.version !== 1 ||
    !Number.isSafeInteger(c.buildNumber) ||
    c.buildNumber < 0 ||
    !Array.isArray(c.queue) ||
    c.queue.length > 10000 ||
    !Number.isInteger(c.index) ||
    c.index < 0 ||
    c.index >= c.queue.length ||
    !Number.isFinite(c.position) ||
    c.position < 0 ||
    !Number.isFinite(c.rate) ||
    c.rate < 0.25 ||
    c.rate > 4 ||
    !Number.isFinite(c.volume) ||
    c.volume < 0 ||
    c.volume > 1 ||
    !["off", "verse", "chapter", "shuffle"].includes(c.repeat) ||
    c.queue.some(
      (item) =>
        !item ||
        typeof item.id !== "string" ||
        !["hymn", "scripture"].includes(item.kind) ||
        (item.kind === "scripture" &&
          (typeof item.bookId !== "string" ||
            !Number.isInteger(item.chapter) ||
            !["zh", "en"].includes(item.locale ?? ""))),
    )
  )
    return { status: "invalid" };
  if (buildNumber <= c.buildNumber) return { status: "unchanged" };
  const current = resolve(c.queue[c.index]);
  if (!current) return { status: "unavailable" };
  const queue: AudioTrack[] = [];
  let index = 0;
  c.queue.forEach((identity, i) => {
    const track = i === c.index ? current : resolve(identity);
    if (i === c.index) index = queue.length;
    if (track) queue.push(track);
  });
  const duration = trackDuration(
    current.chapterAudio ? { ...current, ...current.chapterAudio } : current,
  );
  return {
    status: "ready",
    queue,
    index,
    position: Math.min(c.position, duration || Infinity),
    settings: { rate: c.rate, volume: c.volume, repeat: c.repeat },
  };
}
