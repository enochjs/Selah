import type { Book, Verse } from "../domain/models";
import data from "@selah/content/bible.json";

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
export const bibleRepository: BibleRepository = {
  listBooks: () => books,
  getBook: (id) => books.find((b) => b.id === id) ?? books[18],
  getChapter(id, chapter) {
    return this.getBook(id).chapters[chapter - 1] ?? [];
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
