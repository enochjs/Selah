export interface ReadingPosition {
  bookId: string;
  chapter: number;
  verse: number;
  /** Distance from the verse's top to the viewport's top, in layout points. */
  offset: number;
}

export interface VerseLayout {
  verse: number;
  y: number;
  height: number;
}

export function narrationVerseToFollow(
  track: { bookId?: string; chapter?: number; verse?: number } | null,
  reader: {
    bookId: string;
    chapter: number;
    following: boolean;
    foreground: boolean;
    playing: boolean;
  },
): number | null {
  return reader.following &&
    reader.foreground &&
    reader.playing &&
    track?.bookId === reader.bookId &&
    track.chapter === reader.chapter
    ? (track.verse ?? null)
    : null;
}

export function adjacentChapter(
  books: readonly { id: string; chapters: readonly unknown[] }[],
  bookId: string,
  chapter: number,
  direction: -1 | 1,
): { bookId: string; chapter: number } | null {
  const index = books.findIndex((book) => book.id === bookId);
  if (index < 0) return null;
  const next = chapter + direction;
  if (next >= 1 && next <= books[index].chapters.length)
    return { bookId, chapter: next };
  const book = books[index + direction];
  return book
    ? { bookId: book.id, chapter: direction === 1 ? 1 : book.chapters.length }
    : null;
}

export function captureChapterSwipe(dx: number, dy: number, elapsed: number) {
  return (
    elapsed < 500 &&
    Math.abs(dx) >= 24 &&
    Math.abs(dy) < 24 &&
    Math.abs(dx) > Math.abs(dy) * 2
  );
}

export function chapterSwipe(
  dx: number,
  dy: number,
  elapsed: number,
): -1 | 1 | null {
  if (
    elapsed > 700 ||
    Math.abs(dx) < 64 ||
    Math.abs(dy) >= 40 ||
    Math.abs(dx) <= Math.abs(dy) * 2
  )
    return null;
  return dx < 0 ? 1 : -1;
}

export function visibleReadingPosition(
  bookId: string,
  chapter: number,
  rows: readonly VerseLayout[],
  scrollY: number,
): ReadingPosition | null {
  if (!rows.length) return null;
  const row =
    rows.find((row) => row.y + row.height > scrollY) ?? rows[rows.length - 1];
  return { bookId, chapter, verse: row.verse, offset: scrollY - row.y };
}
