import type { Book, Verse } from "../domain/models";
import data from "@selah/content/bible.json";
import thaiKjv from "@selah/content/thai-kjv.json";

export interface BibleRepository {
  listBooks(): Book[];
  getBook(id: string): Book;
  getChapter(id: string, chapter: number): Verse[];
  search(
    query: string,
    limit?: number,
  ): {
    bookId: string;
    book: string;
    bookZh: string;
    chapter: number;
    verse: Verse;
  }[];
}
const books = data as Book[];
const thaiBooks: Record<
  string,
  ReadonlyArray<Readonly<Partial<Record<number, string>>>>
> = thaiKjv.books;
const chaptersWithThai = new Map<Verse[], Verse[]>();

export const bibleRepository: BibleRepository = {
  listBooks: () => books,
  getBook: (id) => books.find((b) => b.id === id) ?? books[18],
  getChapter(id, chapter) {
    const book = this.getBook(id);
    const verses = book.chapters[chapter - 1];
    if (!verses) return [];
    const cached = chaptersWithThai.get(verses);
    if (cached) return cached;
    const thai = thaiBooks[book.id]?.[chapter - 1];
    if (!thai) return verses;
    const parallel = verses.map((verse) => {
      const text = thai[verse.number];
      if (!text) return verse;
      // The NIV folds John 7:53 into the end of 7:52 in the bundled text.
      const comparison =
        book.id === "john" && chapter === 7 && verse.number === 52 && thai[53]
          ? `${text}\n${thai[53]}`
          : text;
      return {
        ...verse,
        translations: {
          ...verse.translations,
          // The source's break hints can split Thai letters from their marks.
          [thaiKjv.version.id]: comparison.replaceAll("\u200b", ""),
        },
      };
    });
    chaptersWithThai.set(verses, parallel);
    return parallel;
  },
  search(query, limit = 40) {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const results: ReturnType<BibleRepository["search"]> = [];
    for (const book of books)
      for (let c = 0; c < book.chapters.length; c++)
        for (const verse of book.chapters[c]) {
          if (verse.en.toLowerCase().includes(q) || verse.zh.includes(q)) {
            results.push({
              bookId: book.id,
              book: book.en,
              bookZh: book.zh,
              chapter: c + 1,
              verse,
            });
            if (results.length >= limit) return results;
          }
        }
    return results;
  },
};
export const audioChapters = [
  { bookId: "psalms", chapter: 23 },
  { bookId: "john", chapter: 1 },
  { bookId: "genesis", chapter: 1 },
];
