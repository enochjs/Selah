import { expect, it } from "vitest";
import recordings from "@selah/content/chapter-audio.json";
import {
  offlineChapters,
  parseDownloadManifest,
} from "../src/data/offline-catalog";
import type { ChapterRecording } from "../src/domain/models";
const catalog = recordings as unknown as Record<string, ChapterRecording>;
const paths = [
  ...new Set(
    Object.values(catalog).flatMap((recording) => [
      recording.path,
      ...(recording.verseFiles ?? []).map((verse) => verse.path),
    ]),
  ),
];
const manifest = {
  version: 1 as const,
  recordings: catalog,
  files: paths.map((path) => ({
    path,
    size: 100,
    sha256: path.split("/").pop()!.slice(0, -4),
  })),
};
it("selects all 1189 chapters and old/new testament ranges independently for each narration", () => {
  expect(offlineChapters({ kind: "all" }, "en", manifest)).toHaveLength(1189);
  expect(offlineChapters({ kind: "old" }, "zh", manifest)).toHaveLength(929);
  expect(offlineChapters({ kind: "new" }, "zh", manifest)).toHaveLength(260);
  expect(
    offlineChapters({ kind: "book", bookId: "psalms" }, "en", manifest),
  ).toHaveLength(150);
});
it("preserves the server's downloaded timing snapshot and only downloads the chapter", () => {
  const item = offlineChapters(
    { kind: "chapter", bookId: "psalms", chapter: 23 },
    "en",
    manifest,
  )[0];
  expect(item.recording).toEqual(catalog["psalms:23:en"]);
  expect(item.files.map((file) => file.path)).toContain(item.recording.path);
  expect(item.files.map((file) => file.path)).toEqual([item.recording.path]);
  expect(() =>
    offlineChapters({ kind: "chapter", bookId: "psalms", chapter: 23 }, "en", {
      ...manifest,
      recordings: {},
    }),
  ).toThrow("unavailable");
});
it("rejects unsafe paths, mismatched content hashes and incomplete scope resources", () => {
  expect(() =>
    parseDownloadManifest({
      version: 1,
      files: [
        {
          path: "https://example.test/audio.mp3",
          sha256: "a".repeat(64),
          size: 10,
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    parseDownloadManifest({
      version: 1,
      files: [
        {
          path: "/api/audio/resources/" + "a".repeat(64) + ".mp3",
          sha256: "b".repeat(64),
          size: 10,
        },
      ],
    }),
  ).toThrow();
  expect(() =>
    offlineChapters({ kind: "all" }, "en", { ...manifest, files: [] }),
  ).toThrow("unavailable");
});

it("preserves partial recording snapshots without requiring nonexistent missing-verse files", () => {
  const chapterHash = "a".repeat(64),
    verseHash = "b".repeat(64);
  const path = `/api/audio/resources/${chapterHash}.mp3`;
  const versePath = `/api/audio/aligned/${verseHash}.mp3`;
  const recording: ChapterRecording = {
    alignmentStatus: "partial",
    path,
    duration: 20,
    segments: [],
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
    verseFiles: [
      {
        verse: 1,
        path: versePath,
        duration: 10,
        sourceStart: 1,
        sourceEnd: 11,
      },
    ],
  };
  const partial = parseDownloadManifest({
    version: 1,
    recordings: { "john:1:en": recording },
    files: [
      { path, sha256: chapterHash, size: 100 },
      { path: versePath, sha256: verseHash, size: 50 },
    ],
  });
  const chapter = offlineChapters(
    { kind: "chapter", bookId: "john", chapter: 1 },
    "en",
    partial,
  )[0];
  expect(chapter.recording).toEqual(recording);
  expect(chapter.files.map((file) => file.path)).toEqual([path]);
  expect(() =>
    offlineChapters({ kind: "chapter", bookId: "john", chapter: 1 }, "en", {
      ...partial,
      files: partial.files.slice(1),
    }),
  ).toThrow("unavailable");
});
