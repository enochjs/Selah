import { it, expect } from "vitest";
import books from "../data/bible.json";
import recordings from "../data/chapter-audio.json";
const chapter = (id: string, number: number) =>
  books.find((b) => b.id === id)!.chapters[number - 1];
it("restores all 37 Leviticus 19 verses with a clearly identified local supplement", () => {
  const recording = recordings["leviticus:19:en"] as unknown as {
    segments: number[][];
    timingQuality: string;
    alignmentStatus: string;
    timingSupplement: { source: string; mediaSha256: string };
    mediaSha256: string;
  };
  expect(recording.segments.map((s) => s[0])).toEqual(
    Array.from({ length: 37 }, (_, i) => i + 1),
  );
  expect(recording.timingQuality).toBe("forced-alignment");
  expect(recording.alignmentStatus).toBe("aligned");
  expect(recording.timingSupplement.source).toBe("local-verified-supplement");
  expect(recording.timingSupplement.mediaSha256).toBe(recording.mediaSha256);
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
it("uses the BSB text matching the new narration and marks omitted verses", () => {
  expect(chapter("psalms", 23)[0].en).toContain("I shall not want.");
  expect(chapter("john", 5).find((v) => v.number === 4)).toMatchObject({
    en: "",
    enOmitted: true,
  });
});
it("keeps canonical references when the CUV source merges adjacent verses", () => {
  expect(chapter("numbers", 1).find((v) => v.number === 22)).toMatchObject({
    zh: "",
    zhMergedInto: 23,
  });
  expect(chapter("numbers", 1).find((v) => v.number === 23)!.zh).toContain(
    "西缅子孙",
  );
  expect(chapter("numbers", 1).find((v) => v.number === 45)).toMatchObject({
    zh: "",
    zhMergedInto: 46,
  });
  expect(chapter("numbers", 1).find((v) => v.number === 46)!.zh).toContain(
    "这样，凡以色列人中被数的",
  );
});
it("uses provider timings for BSB and independent verse MP3s for Mandarin", () => {
  const en = recordings["psalms:23:en"];
  expect(en.segments).toHaveLength(6);
  expect(en.timingQuality).toBe("provider-timing");
  const zh = recordings["psalms:150:zh"] as unknown as {
    verseFiles: { verse: number; path: string }[];
    timingQuality: string;
    voiceType: string;
  };
  expect(zh.verseFiles).toHaveLength(6);
  expect(zh.verseFiles.map((f) => f.verse)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(new Set(zh.verseFiles.map((f) => f.path)).size).toBe(6);
  expect(zh.timingQuality).toBe("verse-file");
  expect(zh.voiceType).toBe("synthetic");
  expect(
    Object.values(recordings).some(
      (r) => r.timingQuality === "transcript-estimate",
    ),
  ).toBe(false);
});
