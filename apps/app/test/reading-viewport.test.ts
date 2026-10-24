import { expect, it } from "vitest";
import { ReadingViewport } from "../src/features/reader/reading-viewport";

const position = { bookId: "psalms", chapter: 119, verse: 11, offset: 32 };
it.each(["verse-first", "verse-last", "viewport-last"])(
  "restores exactly once with %s layout events",
  (order) => {
    const viewport = new ReadingViewport(position);
    const verse = () =>
      viewport.layoutVerse({ verse: 11, y: 1200, height: 120 });
    const size = () => viewport.layoutContent(4000);
    const window = () => viewport.layoutViewport(700);
    const events =
      order === "verse-first"
        ? [verse, size, window]
        : order === "verse-last"
          ? [window, size, verse]
          : [size, verse, window];
    expect(events[0]()).toBeNull();
    expect(events[1]()).toBeNull();
    expect(events[2]()).toBe(1232);
    expect(viewport.position()).toEqual(position);
    viewport.scrolled(1250);
    expect(viewport.layoutContent(4100)).toBeNull();
    expect(viewport.position()?.offset).toBe(50);
  },
);

it("does not overwrite saved progress before restoration and clamps at the chapter end", () => {
  const viewport = new ReadingViewport(position);
  viewport.scrolled(0);
  expect(viewport.position()).toBeNull();
  viewport.layoutVerse({ verse: 11, y: 1200, height: 120 });
  viewport.layoutViewport(700);
  expect(viewport.layoutContent(1400)).toBe(700);
});

it("opens a new chapter at its heading and can locate another verse in the same chapter", () => {
  const viewport = new ReadingViewport({ ...position, verse: 1, offset: 0 });
  viewport.layoutVerse({ verse: 1, y: 180, height: 120 });
  viewport.layoutVerse({ verse: 11, y: 1200, height: 120 });
  viewport.layoutViewport(700);
  expect(viewport.layoutContent(4000)).toBe(0);
  expect(viewport.request(position)).toBe(1232);
  expect(viewport.position()).toEqual(position);
});

it("corrects a restored anchor when selecting a verse changes its layout, until the user scrolls", () => {
  const viewport = new ReadingViewport(position);
  viewport.layoutVerse({ verse: 11, y: 1200, height: 120 });
  viewport.layoutViewport(700);
  viewport.layoutContent(4000);
  expect(viewport.layoutVerse({ verse: 11, y: 1174, height: 146 })).toBe(1206);
  viewport.scrolled(1400);
  expect(viewport.layoutVerse({ verse: 11, y: 1200, height: 120 })).toBeNull();
  expect(viewport.position()?.offset).toBe(200);
});
