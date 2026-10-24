import { it, expect } from "vitest";
import books from "../data/bible.json";
import recordings from "../data/chapter-audio.json";
import manifest from "../data/resource-manifest.json";
const chapter = (id: string, number: number) =>
  books.find((b) => b.id === id)!.chapters[number - 1];
it("uses a complete fresh snapshot of the requested website", () => {
  expect(manifest.resourceSet).toBe("chineseandenglishbible-v2");
  expect(manifest.versions.en.id).toBe("niv");
  expect(manifest.timedTextFormat).toBe("WebVTT");
  expect(Object.keys(recordings)).toHaveLength(2378);
});
it("keeps canonical verse references when the source contains a missing verse", () => {
  expect(chapter("john", 5).find((v) => v.number === 5)!.zh).toContain(
    "三十八年",
  );
});
it("preserves Psalm 8 verse numbering", () => {
  expect(chapter("psalms", 8).find((v) => v.number === 9)!.zh).toContain(
    "你的名",
  );
});
it("preserves the final verses in Genesis 24", () => {
  expect(chapter("genesis", 24).find((v) => v.number === 67)!.zh).toContain(
    "利百加",
  );
});
it("ships 66 books and 1189 chapters", () => {
  expect(books).toHaveLength(66);
  expect(books.reduce((sum, b) => sum + b.chapters.length, 0)).toBe(1189);
});
it("keeps the website NIV text rather than the previous BSB translation", () => {
  expect(chapter("psalms", 23)[0].en).toContain("I lack nothing.");
  expect(chapter("psalms", 23)[3].en).toContain("the darkest valley");
  expect(chapter("john", 5).find((v) => v.number === 4)!.en).toContain(
    "[From time to time",
  );
});
it("keeps canonical references when the CUV source merges adjacent verses", () => {
  expect(chapter("numbers", 1).find((v) => v.number === 23)).toMatchObject({
    zh: "",
    zhMergedInto: 22,
  });
  expect(chapter("numbers", 1).find((v) => v.number === 22)!.zh).toContain(
    "西缅子孙",
  );
});
it("uses isolated human recordings and WhisperX timings for Psalm 23 in both languages", () => {
  for (const locale of ["en", "zh"]) {
    const recording = (recordings as Record<string, unknown>)[
      `psalms:23:${locale}`
    ] as {
      verseFiles: { verse: number; path: string }[];
      timingQuality: string;
      voiceType: string;
      segments: number[][];
      alignment: { method: string; sourceAudioSha256: string };
      mediaSha256: string;
    };
    expect(recording.verseFiles).toHaveLength(6);
    expect(recording.verseFiles.map((f) => f.verse)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(new Set(recording.verseFiles.map((f) => f.path)).size).toBe(6);
    expect(recording.timingQuality).toBe("verse-file");
    expect(recording.voiceType).toBe("human");
    expect(recording.segments).toEqual([]);
    expect(recording.alignment.method).toBe(
      "whisperx-3.8.6-phoneme-alignment-v1",
    );
    expect(recording.alignment.sourceAudioSha256).toBe(recording.mediaSha256);
  }
  expect(
    Object.values(recordings).some(
      (r) => r.timingQuality === "transcript-estimate",
    ),
  ).toBe(false);
});
