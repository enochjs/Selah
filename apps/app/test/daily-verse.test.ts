import { describe, expect, it } from "vitest";
import type {
  DailyVerseCatalog,
  DailyVerseEntry,
} from "@selah/content/daily-verses";
import { bibleRepository } from "../src/data/bible-repository";
import {
  dailyArchive,
  dailyPassage,
  dailyPrefetchImages,
  passageBookmarkKeys,
  millisecondsUntilNextDailyDate,
} from "../src/domain/daily-verse";

const image = (id: string) => ({
  id,
  file: `${id}.jpg`,
  sha256: id,
  author: "Photographer",
  sourceUrl: "https://example.org/photo",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  width: 1200,
  height: 800,
  theme: "water",
});
const entry = (
  date: string,
  imageId = date,
  status: DailyVerseEntry["status"] = "approved",
): DailyVerseEntry => ({
  id: `daily-${date}`,
  date,
  reference: { bookId: "psalms", chapter: 23, verse: 1, endVerse: 2 },
  imageId,
  theme: "peace",
  status,
});
const catalog: DailyVerseCatalog = {
  revision: 0,
  images: [image("a"), image("b"), image("c"), image("d")],
  items: [
    entry("2026-11-01", "a"),
    entry("2026-11-02", "b"),
    entry("2026-11-03", "c"),
    entry("2026-11-04", "d", "draft"),
  ],
};

describe("daily scripture content", () => {
  it("schedules the next local calendar day across month and year boundaries", () => {
    expect(millisecondsUntilNextDailyDate(new Date(2026, 11, 31, 23, 59, 59, 900))).toBe(150);
    expect(millisecondsUntilNextDailyDate(new Date(2026, 10, 2, 12, 0, 0, 0))).toBe(12 * 60 * 60 * 1000 + 50);
  });
  it("reads complete bilingual verse ranges from the existing scripture repository", () => {
    const reference = catalog.items[0].reference;
    const passage = dailyPassage(reference, bibleRepository)!;
    const verses = bibleRepository
      .getChapter("psalms", 23)
      .filter((v) => v.number <= 2);
    expect(passage.zh).toBe(verses.map((v) => v.zh).join("\n"));
    expect(passage.en).toBe(verses.map((v) => v.en).join("\n"));
    expect(passage.label.zh).toBe("诗篇 23:1–2");
    expect(passage.label.en).toBe("Psalms 23:1–2");
    expect(passageBookmarkKeys(reference)).toEqual([
      "psalms:23:1",
      "psalms:23:2",
    ]);
  });
  it("rejects missing books, verses and partial ranges instead of using repository fallback text", () => {
    for (const reference of [
      { bookId: "missing", chapter: 1, verse: 1 },
      { bookId: "psalms", chapter: 999, verse: 1 },
      { bookId: "psalms", chapter: 23, verse: 6, endVerse: 8 },
    ])
      expect(dailyPassage(reference, bibleRepository)).toBeNull();
  });
  it("keeps the archive past-only and excludes drafts", () => {
    expect(dailyArchive(catalog, "2026-11-02").map((v) => v.date)).toEqual([
      "2026-11-02",
      "2026-11-01",
    ]);
  });
  it("prefetches distinct images for today and the following thirteen civil days", () => {
    const rows = [
      ...catalog.items,
      entry("2026-11-15", "d"),
      entry("2026-11-16", "a"),
    ];
    expect(
      dailyPrefetchImages({ ...catalog, items: rows }, "2026-11-02").map(
        (v) => v.id,
      ),
    ).toEqual(["b", "c", "d"]);
  });
  it("retains the most recent expired image for a dated offline fallback", () => {
    expect(dailyPrefetchImages(catalog, "2027-01-01").map((v) => v.id)).toEqual(
      ["c"],
    );
  });
});
