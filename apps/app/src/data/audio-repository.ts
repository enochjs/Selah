import recordings from "@selah/content/chapter-audio.json";
import type { Locale, ChapterRecording } from "../domain/models";
import { downloadManager } from "./offline-audio-runtime";
export type { ChapterRecording } from "../domain/models";
const catalog = recordings as unknown as Record<string, ChapterRecording>;
export function getChapterRecording(
  bookId: string,
  chapter: number,
  locale: Locale,
): ChapterRecording | null {
  const key = `${bookId}:${chapter}:${locale}`;
  const offline = downloadManager.getSnapshot().chapters[key];
  return offline?.status === "complete"
    ? offline.recording
    : (catalog[key] ?? null);
}
export function hasChapterAudio(bookId: string, chapter: number): boolean {
  return !!(
    getChapterRecording(bookId, chapter, "en") ||
    getChapterRecording(bookId, chapter, "zh")
  );
}
