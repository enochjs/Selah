import { expect, it } from "vitest";
import {
  adjacentChapter,
  captureChapterSwipe,
  chapterSwipe,
  visibleReadingPosition,
  narrationVerseToFollow,
} from "../src/domain/reading";

const books = [
  { id: "genesis", chapters: [[], []] },
  { id: "exodus", chapters: [[], [], []] },
];
it("crosses book boundaries and stops at either end of the Bible", () => {
  expect(adjacentChapter(books, "genesis", 2, 1)).toEqual({
    bookId: "exodus",
    chapter: 1,
  });
  expect(adjacentChapter(books, "exodus", 1, -1)).toEqual({
    bookId: "genesis",
    chapter: 2,
  });
  expect(adjacentChapter(books, "genesis", 1, -1)).toBeNull();
  expect(adjacentChapter(books, "exodus", 3, 1)).toBeNull();
});

it("follows narration only when started in this foreground reader, without stealing a resumed position", () => {
  const track = { bookId: "psalms", chapter: 23, verse: 5 };
  const view = {
    bookId: "psalms",
    chapter: 23,
    following: true,
    foreground: true,
    playing: true,
  };
  expect(narrationVerseToFollow(track, view)).toBe(5);
  expect(
    narrationVerseToFollow(track, { ...view, following: false }),
  ).toBeNull();
  expect(
    narrationVerseToFollow(track, { ...view, foreground: false }),
  ).toBeNull();
  expect(narrationVerseToFollow(track, { ...view, playing: false })).toBeNull();
  expect(
    narrationVerseToFollow(track, { ...view, bookId: "john", chapter: 1 }),
  ).toBeNull();
});
it("only captures deliberate horizontal swipes, preserving vertical scrolling and long presses", () => {
  expect(captureChapterSwipe(28, 4, 180)).toBe(true);
  for (const [dx, dy, elapsed] of [
    [10, 0, 100],
    [30, 40, 100],
    [100, 30, 100],
    [90, 2, 800],
  ]) {
    expect(captureChapterSwipe(dx, dy, elapsed)).toBe(false);
  }
  expect(chapterSwipe(-90, 5, 240)).toBe(1);
  expect(chapterSwipe(90, 5, 240)).toBe(-1);
  expect(chapterSwipe(-35, 5, 240)).toBeNull();
  expect(chapterSwipe(-90, 70, 240)).toBeNull();
});
it("records the verse at the viewport with an offset independent of the selected verse", () => {
  const rows = [
    { verse: 1, y: 180, height: 120 },
    { verse: 2, y: 300, height: 150 },
    { verse: 3, y: 450, height: 80 },
  ];
  expect(visibleReadingPosition("psalms", 23, rows, 335)).toEqual({
    bookId: "psalms",
    chapter: 23,
    verse: 2,
    offset: 35,
  });
  expect(visibleReadingPosition("psalms", 23, rows, 0)).toEqual({
    bookId: "psalms",
    chapter: 23,
    verse: 1,
    offset: -180,
  });
  expect(visibleReadingPosition("psalms", 23, [], 300)).toBeNull();
});
