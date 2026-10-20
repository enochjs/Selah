import type { ChapterRecording } from "./models";

export interface VerseAudioItem {
  verse: number;
  path: string;
  duration: number;
  startTime?: number;
  endTime?: number;
  coveredVerses?: number[];
}

export function recordingAudioItems(
  recording: ChapterRecording,
): VerseAudioItem[] {
  if (recording.verseFiles?.length)
    return recording.verseFiles.map(
      ({ verse, path, duration, coveredVerses }) => ({
        verse,
        path,
        duration,
        ...(coveredVerses ? { coveredVerses } : {}),
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
