import type { AudioTrack, ChapterRecording, Locale } from "./models";

export function matchesVerseAudio(
  track: AudioTrack | null,
  target: { bookId: string; chapter: number; verse: number; locale: Locale },
): boolean {
  return (
    !!track &&
    track.kind === "scripture" &&
    track.bookId === target.bookId &&
    track.chapter === target.chapter &&
    track.locale === target.locale &&
    (track.verse === target.verse ||
      !!track.coveredVerses?.includes(target.verse))
  );
}

export interface VerseAudioItem {
  verse: number;
  path: string;
  duration: number;
  startTime?: number;
  endTime?: number;
  coveredVerses?: number[];
  chapterRange?: { startTime: number; endTime: number };
}

export function recordingAudioItems(
  recording: ChapterRecording,
): VerseAudioItem[] {
  if (recording.verseFiles?.length)
    return recording.verseFiles.map(
      ({ verse, path, duration, coveredVerses, sourceStart, sourceEnd }) => ({
        verse,
        path,
        duration,
        ...(coveredVerses ? { coveredVerses } : {}),
        ...(sourceStart !== undefined &&
        sourceEnd !== undefined &&
        Number.isFinite(sourceStart) &&
        Number.isFinite(sourceEnd) &&
        sourceStart >= 0 &&
        sourceEnd > sourceStart &&
        sourceEnd <= recording.duration
          ? { chapterRange: { startTime: sourceStart, endTime: sourceEnd } }
          : {}),
      }),
    );
  return recording.segments.map(([verse, startTime, endTime]) => ({
    verse,
    path: recording.path,
    startTime,
    endTime,
    duration: endTime - startTime,
  }));
}
