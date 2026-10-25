export interface ChapterPage {
  bookId: string;
  chapter: number;
}

export function chapterPages(
  books: readonly { id: string; chapters: readonly unknown[] }[],
): ChapterPage[] {
  return books.flatMap((book) =>
    book.chapters.map((_, index) => ({ bookId: book.id, chapter: index + 1 })),
  );
}

/** Native events may arrive after a search jump. Never restore their stale chapter. */
export class ChapterPagination {
  private expected: number | null = null;
  constructor(
    private pages: readonly ChapterPage[],
    public index: number,
  ) {}

  request(index: number) {
    if (!this.pages[index] || index === this.index || this.expected !== null)
      return false;
    this.expected = index;
    return true;
  }

  jump(index: number) {
    if (!this.pages[index] || (index === this.index && this.expected === null))
      return false;
    this.index = index;
    this.expected = index;
    return true;
  }

  select(index: number) {
    if (
      !this.pages[index] ||
      (this.expected !== null && index !== this.expected)
    )
      return null;
    this.expected = null;
    if (index === this.index) return null;
    this.index = index;
    return this.pages[index];
  }
}
