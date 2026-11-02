import {
  addDays,
  selectDailyVerse,
  type DailyVerseCatalog,
  type DailyVerseReference,
} from "@selah/content/daily-verses";
import type { Book, Locale, Verse } from "./models";

interface ScriptureReader {
  getBook(id: string): Book;
  getChapter(id: string, chapter: number): Verse[];
}

export function millisecondsUntilNextDailyDate(now: Date): number {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime() + 50;
}
export interface DailyPassage {
  reference: DailyVerseReference;
  label: Record<Locale, string>;
  zh: string;
  en: string;
}

/** Always resolve the same complete passage for reading, bookmarks and sharing. */
export function dailyPassage(
  reference: DailyVerseReference,
  reader: ScriptureReader,
): DailyPassage | null {
  const book = reader.getBook(reference.bookId);
  if (!book || book.id !== reference.bookId) return null;
  const end = reference.endVerse ?? reference.verse;
  if (
    !Number.isInteger(reference.chapter) ||
    !Number.isInteger(reference.verse) ||
    !Number.isInteger(end) ||
    reference.chapter < 1 ||
    reference.verse < 1 ||
    end < reference.verse ||
    end - reference.verse > 9
  )
    return null;
  const chapter = reader.getChapter(reference.bookId, reference.chapter);
  const verses: Verse[] = [];
  for (let number = reference.verse; number <= end; number++) {
    const verse = chapter.find((item) => item.number === number);
    if (
      !verse?.zh.trim() ||
      !verse.en.trim() ||
      verse.enOmitted ||
      verse.zhOmitted ||
      verse.enMergedInto ||
      verse.zhMergedInto
    )
      return null;
    verses.push(verse);
  }
  const location = `${reference.chapter}:${reference.verse}${end === reference.verse ? "" : `–${end}`}`;
  return {
    reference,
    label: { zh: `${book.zh} ${location}`, en: `${book.en} ${location}` },
    zh: verses.map((v) => v.zh).join("\n"),
    en: verses.map((v) => v.en).join("\n"),
  };
}

export function passageBookmarkKeys(reference: DailyVerseReference): string[] {
  const keys: string[] = [];
  for (
    let verse = reference.verse;
    verse <= (reference.endVerse ?? reference.verse);
    verse++
  )
    keys.push(`${reference.bookId}:${reference.chapter}:${verse}`);
  return keys;
}

export function dailyArchive(catalog: DailyVerseCatalog, today: string) {
  return catalog.items
    .filter((item) => item.status === "approved" && item.date <= today)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function dailyPrefetchImages(
  catalog: DailyVerseCatalog,
  today: string,
  days = 14,
) {
  const last = addDays(today, days - 1);
  const ids = new Set(
    catalog.items
      .filter(
        (item) =>
          item.status === "approved" && item.date >= today && item.date <= last,
      )
      .map((item) => item.imageId),
  );
  const selected = selectDailyVerse(catalog, today).entry;
  if (selected) ids.add(selected.imageId);
  return catalog.images.filter((image) => ids.has(image.id));
}
