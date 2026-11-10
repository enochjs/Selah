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

export function rememberReadingPosition(
  recent: readonly ReadingPosition[],
  position: ReadingPosition,
): ReadingPosition[] {
  return [
    { ...position },
    ...recent.filter(
      (item) =>
        item.bookId !== position.bookId || item.chapter !== position.chapter,
    ),
  ].slice(0, 6);
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

export const chapterSwipeSlop = 12;
export const horizontalSwipeSlope = Math.tan((35 * Math.PI) / 180);

export function captureChapterSwipe(dx: number, dy: number, elapsed: number) {
  "worklet";
  return (
    elapsed < 500 &&
    Math.hypot(dx, dy) >= chapterSwipeSlop &&
    Math.abs(dy) <= Math.abs(dx) * horizontalSwipeSlope
  );
}

export function chapterSwipeAxis(
  dx: number,
  dy: number,
  elapsed: number,
): "pending" | "horizontal" | "vertical" {
  "worklet";
  if (Math.hypot(dx, dy) < chapterSwipeSlop) return "pending";
  if (elapsed >= 500) return "vertical";
  return captureChapterSwipe(dx, dy, elapsed) ? "horizontal" : "vertical";
}

/** Completion after horizontal intent is locked; velocity is in dp per ms. */
export function chapterSwipe(dx: number, velocityX = 0): -1 | 1 | null {
  "worklet";
  const distance = Math.abs(dx);
  const flick =
    distance >= 24 && Math.abs(velocityX) >= 0.5 && dx * velocityX > 0;
  if (distance < 48 && !flick) return null;
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
