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

export function isVerseMissing(
  recording: ChapterRecording | null,
  verse: number,
): boolean {
  return (
    recording?.missingVerses?.some(
      (item) =>
        item.verse === verse && item.reason === "not-narrated-in-source",
    ) ?? false
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

export function missingVerseFragments(
  recording: ChapterRecording | null,
  verse: number,
): string[] {
  return (recording?.missingFragments ?? [])
    .filter(
      (item) =>
        item.verse === verse && item.reason === "not-narrated-in-source",
    )
    .map((item) => item.text);
}

export function recordingAudioItems(
  recording: ChapterRecording,
): VerseAudioItem[] {
  if (recording.verseFiles?.length)
    return recording.verseFiles
      .filter(({ verse }) => !isVerseMissing(recording, verse))
      .flatMap(({ verse, coveredVerses, sourceStart, sourceEnd }) => {
        if (
          sourceStart === undefined ||
          sourceEnd === undefined ||
          !Number.isFinite(sourceStart) ||
          !Number.isFinite(sourceEnd) ||
          sourceStart < 0 ||
          sourceEnd <= sourceStart ||
          sourceEnd > recording.duration
        )
          return [];
        return [
          {
            verse,
            path: recording.path,
            startTime: sourceStart,
            endTime: sourceEnd,
            duration: sourceEnd - sourceStart,
            ...(coveredVerses
              ? {
                  coveredVerses: coveredVerses.filter(
                    (verse) => !isVerseMissing(recording, verse),
                  ),
                }
              : {}),
            chapterRange: { startTime: sourceStart, endTime: sourceEnd },
          },
        ];
      });
  return recording.segments
    .filter(([verse]) => !isVerseMissing(recording, verse))
    .map(([verse, startTime, endTime]) => ({
      verse,
      path: recording.path,
      startTime,
      endTime,
      duration: endTime - startTime,
    }));
}
