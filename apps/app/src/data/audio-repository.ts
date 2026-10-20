import recordings from "@selah/content/chapter-audio.json";
import type { Locale, ChapterRecording } from "../domain/models";
export type { ChapterRecording } from "../domain/models";
const catalog = recordings as unknown as Record<string, ChapterRecording>;
export function getChapterRecording(
  bookId: string,
  chapter: number,
  locale: Locale,
): ChapterRecording | null {
  return catalog[`${bookId}:${chapter}:${locale}`] ?? null;
}
export function hasChapterAudio(bookId: string, chapter: number): boolean {
  return !!(
    getChapterRecording(bookId, chapter, "en") ||
    getChapterRecording(bookId, chapter, "zh")
  );
}
