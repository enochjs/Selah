import { describe, it, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const daily = require("../daily-verses.cjs");
const image = {
  id: "a".repeat(64),
  file: "a".repeat(64) + ".jpg",
  sha256: "a".repeat(64),
  author: "Author",
  sourceUrl: "https://example.org/image",
  license: "CC BY 4.0",
  licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
  width: 1200,
  height: 800,
  theme: "hope",
};
const item = {
  id: "daily-2026-11-02",
  date: "2026-11-02",
  reference: { bookId: "psalms", chapter: 23, verse: 1 },
  imageId: image.id,
  theme: "hope",
  status: "approved",
};
const catalog = { revision: 0, images: [image], items: [item] };
describe("daily scripture contract", () => {
  it("validates civil dates and leap arithmetic", () => {
    expect(daily.isDateKey("2026-02-29")).toBe(false);
    expect(daily.isDateKey("2028-02-29")).toBe(true);
    expect(daily.addDays("2028-02-28", 2)).toBe("2028-03-01");
    expect(daily.addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("never selects future or draft and marks fallback stale", () => {
    expect(daily.selectDailyVerse(catalog, "2026-11-01")).toEqual({
      entry: null,
      stale: false,
    });
    expect(daily.selectDailyVerse(catalog, "2026-11-02").stale).toBe(false);
    expect(daily.selectDailyVerse(catalog, "2026-11-03").stale).toBe(true);
    expect(
      daily.selectDailyVerse(
        { ...catalog, items: [{ ...item, status: "draft" }] },
        "2026-11-03",
      ).entry,
    ).toBeNull();
  });
  it("rejects duplicate dates, broken image IDs, unsafe files and damaged metadata", () => {
    for (const bad of [
      { ...catalog, items: [item, { ...item, id: "other" }] },
      { ...catalog, items: [{ ...item, imageId: "b".repeat(64) }] },
      { ...catalog, images: [{ ...image, file: "../escape.jpg" }] },
      { ...catalog, images: [{ ...image, width: 0 }] },
      {
        ...catalog,
        items: [{ ...item, reference: { ...item.reference, verse: 0 } }],
      },
    ])
      expect(() => daily.parseDailyVerseCatalog(bad)).toThrow();
  });
  it("removes reviewer identity", () => {
    expect(
      daily.publishedDailyVerseCatalog({
        ...catalog,
        items: [{ ...item, reviewedBy: "private" }],
      }).items[0].reviewedBy,
    ).toBeUndefined();
  });
});

import {
  readFileSync,
  mkdtempSync,
  writeFileSync,
  symlinkSync,
  rmSync,
  mkdirSync,
  unlinkSync,
} from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { verifyDailyVerses } from "../scripts/check-daily-verses.mjs";
const dataRoot = fileURLToPath(new URL("../data/", import.meta.url));
it("validates all curated references against real bilingual chapter text and photographs", () => {
  const books = JSON.parse(
    readFileSync(path.join(dataRoot, "bible.json"), "utf8"),
  );
  expect(verifyDailyVerses(dataRoot, books).pool).toBeGreaterThanOrEqual(366);
});
it("rejects duplicate pool references, missing real verses and damaged asset hashes", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "selah-daily-"));
  try {
    const catalog = JSON.parse(
      readFileSync(path.join(dataRoot, "daily-verses.json"), "utf8"),
    );
    const pool = JSON.parse(
      readFileSync(path.join(dataRoot, "daily-verse-pool.json"), "utf8"),
    );
    const books = JSON.parse(
      readFileSync(path.join(dataRoot, "bible.json"), "utf8"),
    );
    mkdirSync(path.join(dir, "daily-verse-images"));
    for (const image of catalog.images)
      symlinkSync(
        path.join(dataRoot, "daily-verse-images", image.file),
        path.join(dir, "daily-verse-images", image.file),
      );
    writeFileSync(path.join(dir, "daily-verses.json"), JSON.stringify(catalog));
    writeFileSync(
      path.join(dir, "daily-verse-pool.json"),
      JSON.stringify([...pool, pool[0]]),
    );
    expect(() => verifyDailyVerses(dir, books)).toThrow("Duplicate");
    writeFileSync(
      path.join(dir, "daily-verse-pool.json"),
      JSON.stringify(pool),
    );
    const broken = structuredClone(books);
    broken.find(
      (b: { id: string }) => b.id === pool[0].reference.bookId,
    ).chapters[pool[0].reference.chapter - 1] = [];
    expect(() => verifyDailyVerses(dir, broken)).toThrow("Missing bilingual");
    const damagedFile = path.join(
      dir,
      "daily-verse-images",
      catalog.images[0].file,
    );
    unlinkSync(damagedFile);
    expect(
      verifyDailyVerses(dir, books, path.join(dataRoot, "daily-verse-images"))
        .images,
    ).toBe(90);
    expect(() =>
      verifyDailyVerses(dir, books, path.join(dir, "missing-assets")),
    ).toThrow("ENOENT");
    writeFileSync(damagedFile, "damaged");
    expect(() => verifyDailyVerses(dir, books)).toThrow(
      "Damaged daily photograph",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("keeps seed quantity/theme requirements separate from runtime withdrawals and legacy content", () => {
  const books = JSON.parse(
    readFileSync(path.join(dataRoot, "bible.json"), "utf8"),
  );
  const seed = JSON.parse(
    readFileSync(path.join(dataRoot, "daily-verses.json"), "utf8"),
  );
  const pool = JSON.parse(
    readFileSync(path.join(dataRoot, "daily-verse-pool.json"), "utf8"),
  );
  expect(seed.images).toHaveLength(90);
  expect(
    seed.items.filter((i: { status: string }) => i.status === "approved"),
  ).toHaveLength(90);
  expect(pool.length).toBeGreaterThanOrEqual(366);
  const themes = new Map<string, number>();
  for (const item of pool)
    themes.set(item.theme, (themes.get(item.theme) ?? 0) + 1);
  expect(themes.size).toBeGreaterThanOrEqual(10);
  expect([...themes.values()].every((n) => n >= 20)).toBe(true);
  const dir = mkdtempSync(path.join(tmpdir(), "selah-daily-legacy-"));
  try {
    expect(verifyDailyVerses(dir, books)).toEqual({
      images: 0,
      pool: 0,
      scheduled: 0,
    });
    writeFileSync(
      path.join(dir, "daily-verses.json"),
      JSON.stringify({
        revision: 0,
        images: [seed.images[0]],
        items: [seed.items[0]],
      }),
    );
    expect(
      verifyDailyVerses(dir, books, path.join(dataRoot, "daily-verse-images")),
    ).toEqual({ images: 1, pool: 0, scheduled: 1 });
    seed.items[0].status = "withdrawn";
    writeFileSync(path.join(dir, "daily-verses.json"), JSON.stringify(seed));
    expect(
      verifyDailyVerses(dir, books, path.join(dataRoot, "daily-verse-images"))
        .images,
    ).toBe(90);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it("balances both testaments and several NT books across the actual seed schedule", () => {
  const books = JSON.parse(
    readFileSync(path.join(dataRoot, "bible.json"), "utf8"),
  );
  const seed = JSON.parse(
    readFileSync(path.join(dataRoot, "daily-verses.json"), "utf8"),
  );
  const newBooks = new Set<string>();
  let old = 0,
    newCount = 0;
  for (const entry of seed.items) {
    const b = books.find(
      (book: { id: string }) => book.id === entry.reference.bookId,
    );
    if (b.testament === "new") {
      newCount++;
      newBooks.add(b.id);
    } else old++;
  }
  expect(old).toBeGreaterThanOrEqual(30);
  expect(newCount).toBeGreaterThanOrEqual(30);
  expect(newBooks.size).toBeGreaterThanOrEqual(8);
  expect(seed.items[0].reference).toEqual({
    bookId: "psalms",
    chapter: 27,
    verse: 1,
  });
  for (const image of seed.images) {
    expect(image.author.length).toBeLessThan(120);
    expect(image.author).not.toMatch(
      /Feel free|This Photo was taken|Please do not/i,
    );
  }
});
