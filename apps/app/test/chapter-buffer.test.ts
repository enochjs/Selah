import { expect, it } from "vitest";
import {
  chapterBuffer,
  growChapterBuffer,
} from "../src/features/reader/chapter-buffer";

it("prepares three chapters on both sides without crossing Bible boundaries", () => {
  expect(chapterBuffer(20, 8)).toEqual({ first: 5, last: 11 });
  expect(chapterBuffer(20, 0)).toEqual({ first: 0, last: 3 });
  expect(chapterBuffer(20, 19)).toEqual({ first: 16, last: 19 });
});

it("prepares chapters ahead throughout a long rapid gesture without waiting for selection", () => {
  let buffer = chapterBuffer(1189, 600);
  for (let page = 600; page <= 620; page++) {
    buffer = growChapterBuffer(buffer, 1189, page, 0.2);
    expect(buffer.first).toBe(597);
    expect(buffer.last).toBeGreaterThanOrEqual(page + 4);
  }
  expect(chapterBuffer(1189, 621)).toEqual({ first: 618, last: 624 });
});

it("retains outgoing text when a rapid gesture reverses direction", () => {
  const buffer = chapterBuffer(1189, 600);
  expect(growChapterBuffer(buffer, 1189, 599, 0.9)).toEqual({
    first: 596,
    last: 603,
  });
  expect(growChapterBuffer(buffer, 1189, 600, 0)).toBe(buffer);
});

it("prepares distant destinations without mounting every intervening chapter", () => {
  expect(growChapterBuffer(chapterBuffer(1189, 10), 1189, 900, 0)).toEqual({
    first: 897,
    last: 903,
  });
});
