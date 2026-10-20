import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "content-root": { type: "string" },
    "timing-root": { type: "string" },
    "audit-root": { type: "string" },
  },
});
const contentRoot = values["content-root"]
  ? path.resolve(values["content-root"])
  : fileURLToPath(new URL("../data/", import.meta.url));
const timingRoot = values["timing-root"]
  ? path.resolve(values["timing-root"])
  : fileURLToPath(
      new URL("../../../storage/resources/timing-overrides/", import.meta.url),
    );
const auditRoot = values["audit-root"]
  ? path.resolve(values["audit-root"])
  : fileURLToPath(
      new URL("../../../storage/resources/audits/", import.meta.url),
    );
const read = (name) => JSON.parse(readFileSync(path.join(contentRoot, name)));
const books = read("bible.json"),
  catalog = read("chapter-audio.json"),
  manifest = read("resource-manifest.json");
assert.equal(books.length, 66);
assert.equal(
  books.reduce((n, b) => n + b.chapters.length, 0),
  1189,
);
const providerResources = manifest.resourceSet === "open-provider-v1";
assert.equal(manifest.versions.en.id, providerResources ? "BSB" : "niv");
assert.equal(Object.keys(catalog).length, 2378);
let verses = 0,
  boundaries = 0;
for (const book of books)
  for (const [i, chapter] of book.chapters.entries()) {
    const numbers = new Set();
    for (const verse of chapter) {
      const ref = `${book.en} ${i + 1}:${verse.number}`;
      assert(!numbers.has(verse.number), `Duplicate verse ${ref}`);
      numbers.add(verse.number);
      assert(
        verse.en || verse.enOmitted || verse.enMergedInto,
        `Unexplained missing English ${ref}`,
      );
      assert(
        verse.zh || verse.zhMergedInto || verse.zhOmitted,
        `Unexplained missing Chinese ${ref}`,
      );
      verses++;
    }
    for (const locale of ["en", "zh"]) {
      const key = `${book.id}:${i + 1}:${locale}`,
        recording = catalog[key];
      assert(recording, `Missing recording ${key}`);
      assert(
        /^\/api\/audio\/(bible|aligned|resources)\//.test(recording.path),
        `Invalid media URL ${key}`,
      );
      assert(
        Number.isFinite(recording.duration) && recording.duration > 0,
        `Invalid duration ${key}`,
      );
      let previousEnd = 0;
      const aligned = new Set();
      for (const [number, start, end] of recording.segments) {
        assert(
          numbers.has(number) && !aligned.has(number),
          `Invalid/duplicate verse timing ${key}:${number}`,
        );
        assert(
          chapter.find((v) => v.number === number)[locale],
          `Timing for empty verse ${key}:${number}`,
        );
        assert(
          Number.isFinite(start) &&
            Number.isFinite(end) &&
            start >= previousEnd &&
            end > start &&
            end <= recording.duration,
          `Invalid timing range ${key}:${number}`,
        );
        aligned.add(number);
        previousEnd = end;
        boundaries++;
      }
      assert.notEqual(
        recording.timingQuality,
        "transcript-estimate",
        `Legacy estimates must not be used ${key}`,
      );
      if (recording.verseFiles?.length) {
        assert.equal(recording.timingQuality, "verse-file");
        assert.equal(recording.alignmentStatus, "aligned");
        assert.equal(recording.voiceType, "synthetic");
        assert.equal(recording.segments.length, 0);
        assert.deepEqual(
          recording.verseFiles.map((f) => f.verse),
          chapter.filter((v) => v[locale]?.trim()).map((v) => v.number),
        );
        for (const file of recording.verseFiles) {
          assert(
            Number.isFinite(file.duration) && file.duration > 0,
            `Invalid verse MP3 ${key}:${file.verse}`,
          );
          assert.match(
            file.path,
            /^\/api\/audio\/resources\/[a-f0-9]{64}\.mp3$/,
          );
          assert.equal(file.path.split("/").at(-1), `${file.sha256}.mp3`);
          boundaries++;
        }
      } else if (recording.segments.length) {
        assert.equal(
          recording.timingQuality,
          providerResources && !recording.timingSupplement
            ? "provider-timing"
            : "forced-alignment",
          `Unverified timing ${key}`,
        );
        assert.equal(
          recording.alignmentStatus,
          "aligned",
          `Unverified status ${key}`,
        );
        if (!providerResources) {
          assert.equal(recording.alignment.method, "ctc-forced-alignment");
          assert.match(recording.alignment.fingerprint, /^[a-f0-9]{64}$/);
        } else {
          assert.equal(recording.provider, "ao-bsb");
          assert.equal(recording.translationId, "BSB");
          assert.match(recording.mediaSha256, /^[a-f0-9]{64}$/);
          if (recording.timingSupplement) {
            const supplement = recording.timingSupplement;
            assert.equal(supplement.source, "local-verified-supplement");
            assert.equal(supplement.mediaSha256, recording.mediaSha256);
            const bytes = readFileSync(
              path.join(timingRoot, `${key.replaceAll(":", "__")}.json`),
            );
            assert.equal(
              createHash("sha256").update(bytes).digest("hex"),
              supplement.artifactSha256,
            );
            const artifact = JSON.parse(bytes);
            assert.deepEqual(recording.segments, artifact.quality.segments);
            assert.match(artifact.auditFile, /^[a-z0-9-]+\.json$/);
            const audit = readFileSync(
              path.join(auditRoot, artifact.auditFile),
            );
            assert.equal(
              createHash("sha256").update(audit).digest("hex"),
              supplement.auditSha256,
            );
          }
        }
        assert.match(
          recording.path,
          providerResources
            ? /^\/api\/audio\/resources\/[a-f0-9]{64}\.mp3$/
            : /^\/api\/audio\/aligned\/[a-f0-9]{64}\.mp3$/,
        );
        const expected = chapter
          .filter((v) => v[locale]?.trim())
          .map((v) => v.number);
        assert.deepEqual(
          [...aligned],
          expected,
          `Incomplete verse timing ${key}`,
        );
      }
    }
  }
if (providerResources) {
  assert.equal(manifest.pendingRecordings, 0);
  assert.equal(manifest.verseFileRecordings, 1189);
  assert.equal(manifest.reviewRecordings, 0, "Verse timing coverage regressed");
  assert.equal(manifest.localTimingRecordings, 1);
  assert.equal(manifest.verseBoundaries, boundaries);
}
console.log(
  `Verified ${books.length} books, 1189 chapters, ${verses} verse references, 2378 chapter recordings and ${boundaries} verse audio items (${manifest.versions.en.id} / ${manifest.versions.zh.id}).`,
);
