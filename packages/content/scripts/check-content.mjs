import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    "content-root": { type: "string" },
    "daily-image-root": { type: "string" },
    "timing-root": { type: "string" },
    "audit-root": { type: "string" },
    "timed-text-root": { type: "string" },
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
const timedTextRoot = values["timed-text-root"]
  ? path.resolve(values["timed-text-root"])
  : fileURLToPath(
      new URL("../../../storage/resources/timings/", import.meta.url),
    );
const books = read("bible.json"),
  catalog = read("chapter-audio.json"),
  manifest = read("resource-manifest.json");
assert.equal(books.length, 66);
assert.equal(
  books.reduce((n, b) => n + b.chapters.length, 0),
  1189,
);
const providerResources = manifest.resourceSet === "open-provider-v1";
const websiteResources = manifest.resourceSet === "chineseandenglishbible-v2";
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
      const expectedFileVerses = chapter
        .filter(
          (verse) => verse[locale]?.trim() || verse[`${locale}MergedInto`],
        )
        .map((verse) => verse.number);
      const missing = recording.missingVerses ?? [];
      assert(Array.isArray(missing), `Invalid missing verses ${key}`);
      const missingNumbers = new Set();
      for (const item of missing) {
        assert.deepEqual(
          Object.keys(item).sort(),
          ["reason", "verse"],
          `Unexpected missing verse metadata ${key}`,
        );
        assert.equal(item.reason, "not-narrated-in-source");
        assert(
          expectedFileVerses.includes(item.verse) &&
            !missingNumbers.has(item.verse) &&
            !aligned.has(item.verse),
          `Invalid/duplicate missing verse ${key}:${item.verse}`,
        );
        missingNumbers.add(item.verse);
      }
      const fragments = recording.missingFragments ?? [];
      assert(Array.isArray(fragments), `Invalid missing fragments ${key}`);
      const fragmentKeys = new Set();
      for (const item of fragments) {
        assert.deepEqual(Object.keys(item).sort(), ["reason", "text", "verse"]);
        const text = chapter.find((verse) => verse.number === item.verse)?.[
          locale
        ];
        const identity = `${item.verse}:${item.text}`;
        assert(
          item.reason === "not-narrated-in-source" &&
            typeof item.text === "string" &&
            item.text.trim().length > 0 &&
            typeof text === "string" &&
            text.includes(item.text) &&
            text !== item.text &&
            recording.verseFiles?.some((file) => file.verse === item.verse) &&
            !missingNumbers.has(item.verse) &&
            !fragmentKeys.has(identity),
          `Invalid/duplicate missing fragment ${key}:${item.verse}`,
        );
        fragmentKeys.add(identity);
      }
      if (recording.alignmentStatus === "partial") {
        assert(
          missing.length + fragments.length > 0,
          `Partial recording needs missing narration ${key}`,
        );
        assert(
          recording.verseFiles?.length > 0,
          `Partial recording needs verified files ${key}`,
        );
      } else {
        assert.equal(
          missing.length + fragments.length,
          0,
          `Missing verses require partial status ${key}`,
        );
      }
      if (recording.verseFiles?.length) {
        assert.equal(recording.timingQuality, "verse-file");
        assert(["aligned", "partial"].includes(recording.alignmentStatus));
        assert.equal(
          recording.voiceType,
          websiteResources ? "human" : "synthetic",
        );
        assert.equal(recording.segments.length, 0);
        const coverage = new Set();
        for (const file of recording.verseFiles) {
          const covered = file.coveredVerses ?? [file.verse];
          assert(
            Array.isArray(covered) &&
              covered.length > 0 &&
              covered.includes(file.verse),
            `Invalid verse aliases ${key}:${file.verse}`,
          );
          for (const number of covered) {
            assert(
              expectedFileVerses.includes(number) &&
                !coverage.has(number) &&
                !missingNumbers.has(number),
              `Invalid/duplicate audio coverage ${key}:${number}`,
            );
            coverage.add(number);
          }
          assert(
            Number.isFinite(file.duration) && file.duration > 0,
            `Invalid verse MP3 ${key}:${file.verse}`,
          );
          assert.match(
            file.path,
            /^\/api\/audio\/resources\/[a-f0-9]{64}\.mp3$/,
          );
          assert.equal(file.path.split("/").at(-1), `${file.sha256}.mp3`);
          if (websiteResources) {
            assert(file.sourceEnd > file.sourceStart && file.sourceStart >= 0);
            assert(file.sourceEnd <= recording.duration);
            assert(
              Math.abs(file.duration - (file.sourceEnd - file.sourceStart)) <
                0.002,
            );
          }
          boundaries++;
        }
        assert.deepEqual(
          [...coverage, ...missingNumbers].sort((a, b) => a - b),
          expectedFileVerses,
          `Incomplete verse audio ${key}`,
        );
        if (websiteResources) {
          assert.equal(
            recording.alignment.method,
            "whisperx-3.8.6-phoneme-alignment-v1",
          );
          assert.equal(
            recording.alignment.sourceAudioSha256,
            recording.mediaSha256,
          );
          assert.match(recording.alignment.fingerprint, /^[a-f0-9]{64}$/);
          assert.equal(recording.vttFile, `${recording.vttSha256}.vtt`);
          assert.match(recording.vttFile, /^[a-f0-9]{64}\.vtt$/);
          const vtt = readFileSync(path.join(timedTextRoot, recording.vttFile));
          assert(vtt.toString().startsWith("WEBVTT\n\n"));
          if (missingNumbers.size) {
            for (const cue of vtt
              .toString()
              .matchAll(/^[A-Z0-9]{3}\.(\d+)\.(\d+)(?:-(\d+))?\r?$/gm)) {
              const startVerse = Number(cue[2]);
              const endVerse = Number(cue[3] ?? cue[2]);
              assert(
                ![...missingNumbers].some(
                  (number) =>
                    Number(cue[1]) === i + 1 &&
                    number >= startVerse &&
                    number <= endVerse,
                ),
                `WebVTT timing for missing verse ${key}:${cue[0]}`,
              );
            }
          }
          assert.equal(
            createHash("sha256").update(vtt).digest("hex"),
            recording.vttSha256,
          );
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
if (websiteResources) {
  assert.equal(manifest.timedTextFormat, "WebVTT");
  assert.equal(manifest.verseBoundaries, boundaries);
  assert.equal(
    manifest.alignedRecordings +
      (manifest.partialRecordings ?? 0) +
      manifest.pendingRecordings +
      manifest.reviewRecordings,
    2378,
  );
  assert.equal(
    manifest.verseFileRecordings,
    manifest.alignedRecordings + (manifest.partialRecordings ?? 0),
  );
  const recordings = Object.values(catalog);
  for (const [field, status] of [
    ["alignedRecordings", "aligned"],
    ["partialRecordings", "partial"],
    ["pendingRecordings", "pending"],
    ["reviewRecordings", "review-required"],
  ])
    assert.equal(
      manifest[field] ?? 0,
      recordings.filter((recording) => recording.alignmentStatus === status)
        .length,
      `Incorrect ${field}`,
    );
  assert.equal(
    manifest.missingVerseCount ?? 0,
    recordings.reduce(
      (sum, recording) => sum + (recording.missingVerses?.length ?? 0),
      0,
    ),
    "Incorrect missingVerseCount",
  );
  assert.equal(
    manifest.missingFragmentCount ?? 0,
    recordings.reduce(
      (sum, recording) => sum + (recording.missingFragments?.length ?? 0),
      0,
    ),
    "Incorrect missingFragmentCount",
  );
  if (manifest.chapterOnlyRecordings !== undefined)
    assert.deepEqual(
      [...manifest.chapterOnlyRecordings].sort(),
      Object.entries(catalog)
        .filter(([, recording]) => !recording.verseFiles?.length)
        .map(([key]) => key)
        .sort(),
      "Incorrect chapterOnlyRecordings",
    );
  for (const recording of Object.values(catalog)) {
    assert.equal(recording.voiceType, "human");
    assert.match(recording.mediaSha256, /^[a-f0-9]{64}$/);
    assert.equal(
      recording.path,
      `/api/audio/resources/${recording.mediaSha256}.mp3`,
    );
    assert.equal(recording.sourceSite, "https://chineseandenglishbible.com");
  }
}
console.log(
  `Verified ${books.length} books, 1189 chapters, ${verses} verse references, 2378 chapter recordings and ${boundaries} verse audio items (${manifest.versions.en.id} / ${manifest.versions.zh.id}).`,
);

const { verifyDailyVerses } = await import("./check-daily-verses.mjs");
const dailyCounts = verifyDailyVerses(
  contentRoot,
  books,
  values["daily-image-root"]
    ? path.resolve(values["daily-image-root"])
    : undefined,
);
console.log(
  "Verified daily scripture: " +
    dailyCounts.pool +
    " references, " +
    dailyCounts.images +
    " photographs, " +
    dailyCounts.scheduled +
    " scheduled days",
);
