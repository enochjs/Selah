import { afterEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import path from "node:path";

const roots: string[] = [];
afterEach(() =>
  roots
    .splice(0)
    .forEach((root) => rmSync(root, { recursive: true, force: true })),
);

function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "selah-partial-content-"));
  roots.push(root);
  const hash = "a".repeat(64);
  const vtt = Buffer.from("WEBVTT\n\nGEN.1.1\n00:00.000 --> 00:01.000\nOne\n");
  const vttHash = createHash("sha256").update(vtt).digest("hex");
  writeFileSync(path.join(root, `${vttHash}.vtt`), vtt);
  const books = Array.from({ length: 66 }, (_, index) => ({
    id: `book-${index}`,
    en: `Book ${index}`,
    zh: "书",
    testament: "old",
    chapters: Array.from({ length: index === 65 ? 19 : 18 }, () =>
      [1, 2, 3].map((number) => ({
        number,
        en: `Verse ${number}`,
        zh: `节${number}`,
      })),
    ),
  }));
  const catalog = Object.fromEntries(
    books.flatMap((book) =>
      book.chapters.flatMap((_, index) =>
        ["en", "zh"].map((locale) => [
          `${book.id}:${index + 1}:${locale}`,
          {
            path: `/api/audio/resources/${hash}.mp3`,
            duration: 10,
            segments: [],
            voiceType: "human",
            mediaSha256: hash,
            sourceSite: "https://chineseandenglishbible.com",
            timingQuality: "unaligned",
            alignmentStatus: "pending",
          },
        ]),
      ),
    ),
  );
  const key = "book-0:1:en";
  const recording = {
    ...catalog[key],
    timingQuality: "verse-file",
    alignmentStatus: "partial",
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
    verseFiles: [1, 3].map((verse) => ({
      verse,
      path: `/api/audio/resources/${hash}.mp3`,
      sha256: hash,
      duration: 1,
      sourceStart: verse,
      sourceEnd: verse + 1,
    })),
    alignment: {
      method: "whisperx-3.8.6-phoneme-alignment-v1",
      sourceAudioSha256: hash,
      fingerprint: hash,
    },
    vttFile: `${vttHash}.vtt`,
    vttSha256: vttHash,
  };
  catalog[key] = recording;
  const manifest = {
    resourceSet: "chineseandenglishbible-v2",
    timedTextFormat: "WebVTT",
    versions: { en: { id: "niv" }, zh: { id: "cuv" } },
    alignedRecordings: 0,
    partialRecordings: 1,
    missingVerseCount: 1,
    verseFileRecordings: 1,
    pendingRecordings: 2377,
    reviewRecordings: 0,
    verseBoundaries: 2,
    chapterOnlyRecordings: Object.keys(catalog).filter(
      (entry) => entry !== key,
    ),
  };
  return { root, books, catalog, recording, manifest, key };
}
function check(data: ReturnType<typeof fixture>) {
  for (const [name, value] of Object.entries({
    "bible.json": data.books,
    "chapter-audio.json": data.catalog,
    "resource-manifest.json": data.manifest,
  }))
    writeFileSync(path.join(data.root, name), JSON.stringify(value));
  return spawnSync(
    process.execPath,
    [
      path.resolve("scripts/check-content.mjs"),
      "--content-root",
      data.root,
      "--timed-text-root",
      data.root,
    ],
    { encoding: "utf8" },
  );
}
it("accepts confirmed missing narration while retaining every available verified verse", () => {
  const result = check(fixture());
  expect(result.status, result.stderr).toBe(0);
});
it("accepts a missing text fragment while keeping that verse's real audio playable", () => {
  const data = fixture();
  data.recording.missingVerses = [];
  data.recording.verseFiles.push({ ...data.recording.verseFiles[0], verse: 2 });
  data.recording.verseFiles.sort((a, b) => a.verse - b.verse);
  Object.assign(data.recording, {
    missingFragments: [
      { verse: 2, text: "Verse", reason: "not-narrated-in-source" },
    ],
  });
  Object.assign(data.manifest, {
    missingFragmentCount: 1,
    missingVerseCount: 0,
    verseBoundaries: 3,
  });
  const result = check(data);
  expect(result.status, result.stderr).toBe(0);
});
it("rejects missing fragment text that is absent from the canonical verse", () => {
  const data = fixture();
  Object.assign(data.recording, {
    missingFragments: [
      { verse: 1, text: "Invented text", reason: "not-narrated-in-source" },
    ],
  });
  Object.assign(data.manifest, { missingFragmentCount: 1 });
  expect(check(data).status).not.toBe(0);
});
it("accepts coveredVerses aliases as actual audio coverage", () => {
  const data = fixture();
  data.recording.verseFiles = [
    { ...data.recording.verseFiles[0], coveredVerses: [1, 3] },
  ];
  data.manifest.verseBoundaries = 1;
  const result = check(data);
  expect(result.status, result.stderr).toBe(0);
});
it("accepts merged text references covered by an existing verse file", () => {
  const data = fixture();
  data.books[0].chapters[0][2].en = "";
  data.books[0].chapters[0][2].enMergedInto = 1;
  data.recording.verseFiles = [
    { ...data.recording.verseFiles[0], coveredVerses: [1, 3] },
  ];
  data.manifest.verseBoundaries = 1;
  const result = check(data);
  expect(result.status, result.stderr).toBe(0);
});
it("accepts legacy complete recordings without new manifest fields", () => {
  const data = fixture();
  data.recording.alignmentStatus = "aligned";
  delete data.recording.missingVerses;
  data.recording.verseFiles.push({ ...data.recording.verseFiles[0], verse: 2 });
  data.recording.verseFiles.sort((a, b) => a.verse - b.verse);
  data.manifest.alignedRecordings = 1;
  delete data.manifest.partialRecordings;
  delete data.manifest.missingVerseCount;
  data.manifest.verseBoundaries = 3;
  const result = check(data);
  expect(result.status, result.stderr).toBe(0);
});
for (const [label, mutate] of [
  [
    "unexplained gap",
    (data) => {
      data.recording.verseFiles.pop();
    },
  ],
  [
    "empty missing metadata",
    (data) => {
      data.recording.missingVerses = [];
    },
  ],
  [
    "missing files",
    (data) => {
      data.recording.verseFiles = [];
    },
  ],
  [
    "missing metadata on complete recording",
    (data) => {
      data.recording.alignmentStatus = "aligned";
    },
  ],
  [
    "duplicate missing verse",
    (data) => {
      data.recording.missingVerses.push(data.recording.missingVerses[0]);
    },
  ],
  [
    "out of range missing verse",
    (data) => {
      data.recording.missingVerses[0].verse = 4;
    },
  ],
  [
    "unknown missing reason",
    (data) => {
      data.recording.missingVerses[0].reason = "unsure";
    },
  ],
  [
    "fake timing for missing verse",
    (data) => {
      data.recording.segments = [[2, 0, 1]];
    },
  ],
  [
    "WebVTT cue for missing verse",
    (data) => {
      const vtt = Buffer.from(
        "WEBVTT\n\nGEN.1.2\n00:00.000 --> 00:01.000\nMissing\n",
      );
      const hash = createHash("sha256").update(vtt).digest("hex");
      data.recording.vttFile = `${hash}.vtt`;
      data.recording.vttSha256 = hash;
      writeFileSync(path.join(data.root, data.recording.vttFile), vtt);
    },
  ],
  [
    "fake file for missing verse",
    (data) => {
      data.recording.verseFiles.push({
        ...data.recording.verseFiles[0],
        verse: 2,
      });
    },
  ],
  [
    "duplicate audio coverage",
    (data) => {
      data.recording.verseFiles.push(data.recording.verseFiles[0]);
    },
  ],
  [
    "missing verse hidden in alias",
    (data) => {
      data.recording.verseFiles[0].coveredVerses = [1, 2];
    },
  ],
  [
    "empty alias",
    (data) => {
      data.recording.verseFiles[0].coveredVerses = [];
    },
  ],
  [
    "alias omits primary verse",
    (data) => {
      data.recording.verseFiles[0].coveredVerses = [3];
    },
  ],
  [
    "missing count mismatch",
    (data) => {
      data.manifest.missingVerseCount = 0;
    },
  ],
  [
    "partial counted as aligned",
    (data) => {
      data.manifest.alignedRecordings = 1;
      data.manifest.partialRecordings = 0;
    },
  ],
  [
    "partial counted as chapter only",
    (data) => {
      data.manifest.chapterOnlyRecordings.push(data.key);
    },
  ],
  [
    "review counted as pending",
    (data) => {
      data.catalog["book-0:1:zh"].alignmentStatus = "review-required";
    },
  ],
] as const)
  it(`rejects ${label}`, () => {
    const data = fixture();
    mutate(data);
    expect(check(data).status).not.toBe(0);
  });
