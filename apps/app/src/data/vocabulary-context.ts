import { bibleRepository } from "./bible-repository";
import { matchesSavedContext } from "../domain/vocabulary";

/** Never attach a current translation to a sentence saved from an older edition. */
export function vocabularyTranslation(
  reference: string,
  context: string,
  language = "en",
): string | null {
  const match = /^(.*?)\s+(\d+):(\d+)$/.exec(reference);
  if (!match) return null;
  const book = bibleRepository
    .listBooks()
    .find((book) => book.en.toLowerCase() === match[1].toLowerCase());
  if (!book) return null;
  const verse = bibleRepository
    .getChapter(book.id, Number(match[2]))
    .find((v) => v.number === Number(match[3]));
  if (!verse || (language !== "en" && language !== "zh")) return null;
  return matchesSavedContext(context, verse[language])
    ? verse[language === "en" ? "zh" : "en"] || null
    : null;
}
