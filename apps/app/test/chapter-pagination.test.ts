import { expect, it } from "vitest";
import {
  ChapterPagination,
  chapterPages,
} from "../src/features/reader/chapter-pagination";

const pages = chapterPages([
  { id: "genesis", chapters: [[], []] },
  { id: "exodus", chapters: [[], [], []] },
]);

it("keeps Bible order across book boundaries and exposes only real chapters", () => {
  expect(pages).toEqual([
    { bookId: "genesis", chapter: 1 },
    { bookId: "genesis", chapter: 2 },
    { bookId: "exodus", chapter: 1 },
    { bookId: "exodus", chapter: 2 },
    { bookId: "exodus", chapter: 3 },
  ]);
  const pager = new ChapterPagination(pages, 0);
  expect(pager.request(-1)).toBe(false);
  expect(pager.select(-1)).toBeNull();
  expect(pager.request(5)).toBe(false);
});

it("ignores the initial zero-offset event while a later saved chapter is being positioned", () => {
  const pager = new ChapterPagination(pages, 3);
  expect(pager.select(0)).toBeNull();
  expect(pager.index).toBe(3);
  expect(pager.select(3)).toBeNull();
  expect(pager.request(4)).toBe(true);
});

it("commits only the chapter the native pager actually settled on", () => {
  const pager = new ChapterPagination(pages, 1);
  pager.select(1);
  expect(pager.request(2)).toBe(true);
  expect(pager.index).toBe(1);
  expect(pager.request(3)).toBe(false);
  expect(pager.select(2)).toEqual({ bookId: "exodus", chapter: 1 });
  expect(pager.index).toBe(2);
  expect(pager.select(2)).toBeNull();
});

it("leaves reading state unchanged after a native cancelled swipe", () => {
  const pager = new ChapterPagination(pages, 2);
  expect(pager.select(2)).toBeNull();
  expect(pager.index).toBe(2);
  expect(pager.select(1)).toEqual({ bookId: "genesis", chapter: 2 });
});

it("unlocks button navigation when a new finger drag cancels a requested page turn", () => {
  const pager = new ChapterPagination(pages, 2);
  pager.select(2);
  expect(pager.request(3)).toBe(true);
  pager.beginDrag();
  expect(pager.select(2)).toBeNull();
  expect(pager.request(1)).toBe(true);
  expect(pager.select(1)).toEqual({ bookId: "genesis", chapter: 2 });
});

it("accepts the actual settled page when a mouse wheel interrupts an arrow animation", () => {
  const pager = new ChapterPagination(pages, 2);
  pager.select(2);
  expect(pager.request(3)).toBe(true);
  expect(pager.select(2)).toBeNull();
  expect(pager.request(1)).toBe(true);
});

it("ignores a stale page event after an external search or recent-reading jump", () => {
  const pager = new ChapterPagination(pages, 1);
  pager.select(1);
  pager.request(2);
  expect(pager.jump(4)).toBe(true);
  expect(pager.select(2)).toBeNull();
  expect(pager.index).toBe(4);
  expect(pager.select(4)).toBeNull();
  expect(pager.select(3)).toEqual({ bookId: "exodus", chapter: 2 });
});
