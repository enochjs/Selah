import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import daily from "../daily-verses.cjs";
export function verifyDailyVerses(contentRoot, books, dailyImageRoot) {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const stateRoot = process.env.ADMIN_STATE_ROOT
    ? path.resolve(repoRoot, process.env.ADMIN_STATE_ROOT)
    : path.join(repoRoot, "storage/admin");
  const runtimeImages =
    dailyImageRoot ?? path.join(stateRoot, "daily-verse-images");
  const read = (name) =>
    JSON.parse(readFileSync(path.join(contentRoot, name), "utf8"));
  const catalog = existsSync(path.join(contentRoot, "daily-verses.json"))
    ? daily.parseDailyVerseCatalog(read("daily-verses.json"))
    : { revision: 0, images: [], items: [] };
  const pool = existsSync(path.join(contentRoot, "daily-verse-pool.json"))
    ? read("daily-verse-pool.json")
    : [];
  assert(Array.isArray(pool), "Invalid daily verse pool");
  const refs = new Set();
  const checkRef = (r) => {
    assert(
      r && typeof r === "object" && !Array.isArray(r),
      "Invalid daily scripture reference",
    );
    assert(
      Object.keys(r).every((k) =>
        ["bookId", "chapter", "verse", "endVerse"].includes(k),
      ),
      "Unknown reference field",
    );
    assert(
      typeof r.bookId === "string" &&
        Number.isInteger(r.chapter) &&
        r.chapter > 0 &&
        Number.isInteger(r.verse) &&
        r.verse > 0,
      "Invalid daily scripture bounds",
    );
    assert(
      r.endVerse === undefined ||
        (Number.isInteger(r.endVerse) &&
          r.endVerse >= r.verse &&
          r.endVerse - r.verse < 10),
      "Invalid daily scripture range",
    );
    const book = books.find((b) => b.id === r.bookId);
    assert(book, "Unknown daily scripture book");
    const chapter = book.chapters[r.chapter - 1];
    assert(chapter, "Missing daily scripture chapter");
    for (let n = r.verse; n <= (r.endVerse ?? r.verse); n++) {
      const v = chapter.find((v) => v.number === n);
      assert(
        v?.en?.trim() &&
          v?.zh?.trim() &&
          !v.enOmitted &&
          !v.zhOmitted &&
          !v.enMergedInto &&
          !v.zhMergedInto,
        "Missing bilingual daily scripture text",
      );
    }
  };
  for (const item of pool) {
    assert.deepEqual(Object.keys(item).sort(), ["reference", "theme"]);
    assert(typeof item.theme === "string" && item.theme.length > 0);
    checkRef(item.reference);
    for (
      let verse = item.reference.verse;
      verse <= (item.reference.endVerse ?? item.reference.verse);
      verse++
    ) {
      const key =
        item.reference.bookId + ":" + item.reference.chapter + ":" + verse;
      assert(!refs.has(key), "Duplicate daily verse pool reference");
      refs.add(key);
    }
  }
  const approved = catalog.items
    .filter((i) => i.status === "approved")
    .sort((a, b) => a.date.localeCompare(b.date));
  for (const [index, item] of approved.entries()) {
    checkRef(item.reference);
    for (const previous of approved.slice(0, index)) {
      if (daily.addDays(previous.date, 365) <= item.date) continue;
      assert(
        previous.imageId !== item.imageId,
        "Photograph reused within365 days",
      );
      const a = previous.reference,
        b = item.reference;
      assert(
        a.bookId !== b.bookId ||
          a.chapter !== b.chapter ||
          (a.endVerse ?? a.verse) < b.verse ||
          (b.endVerse ?? b.verse) < a.verse,
        "Scripture reused within365 days",
      );
    }
  }
  for (const item of catalog.items) checkRef(item.reference);
  const hashes = new Set();
  for (const image of catalog.images) {
    const bundledFile = path.join(
      contentRoot,
      "daily-verse-images",
      image.file,
    );
    const bytes = readFileSync(
      existsSync(bundledFile)
        ? bundledFile
        : path.join(runtimeImages, image.file),
    );
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      image.sha256,
      "Damaged daily photograph",
    );
    assert(
      bytes[0] === 255 &&
        bytes[1] === 216 &&
        bytes[bytes.length - 2] === 255 &&
        bytes[bytes.length - 1] === 217,
      "Not a JPEG",
    );
    assert.deepEqual(
      jpegDimensions(bytes),
      { width: image.width, height: image.height },
      "JPEG dimensions disagree with metadata",
    );
    assert(!hashes.has(image.sha256), "Duplicate photograph");
    hashes.add(image.sha256);
  }
  return {
    images: catalog.images.length,
    pool: pool.length,
    scheduled: catalog.items.length,
  };
}

function jpegDimensions(bytes) {
  let offset = 2;
  while (offset < bytes.length - 8) {
    assert.equal(bytes[offset], 255, "Malformed JPEG marker");
    const marker = bytes[offset + 1];
    offset += 2;
    if (marker === 255) {
      offset--;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset);
    assert(
      length >= 2 && offset + length <= bytes.length,
      "Malformed JPEG length",
    );
    if (
      [
        0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce,
        0xcf,
      ].includes(marker)
    ) {
      assert(length >= 8);
      return {
        height: bytes.readUInt16BE(offset + 3),
        width: bytes.readUInt16BE(offset + 5),
      };
    }
    offset += length;
  }
  throw new Error("JPEG missing dimensions");
}
