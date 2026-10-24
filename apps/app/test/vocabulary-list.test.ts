import { describe, expect, it, vi } from "vitest";
import { createWord, selectVocabularyWords } from "../src/domain/vocabulary";

const now = new Date("2026-10-24T08:00:00Z");
const older = createWord(
  "grace",
  "恩典",
  "John 1:16",
  "",
  new Date("2026-10-20"),
);
const newer = createWord("faith", "信心", "Hebrews 11:1", "", now);

describe("Vocabulary list on native JavaScript engines", () => {
  it.each(["recent", "az"] as const)(
    "supports %s sorting without Array.toSorted and preserves saved order",
    (sort) => {
      const unavailable = vi
        .spyOn(Array.prototype, "toSorted")
        .mockImplementation(() => {
          throw new TypeError("toSorted is not a function");
        });
      try {
        const words = Object.freeze([older, newer]);
        expect(selectVocabularyWords(words, "all", "", sort, now)).toEqual([
          newer,
          older,
        ]);
        expect(words).toEqual([older, newer]);
        expect(unavailable).not.toHaveBeenCalled();
      } finally {
        unavailable.mockRestore();
      }
    },
  );

  it("handles an empty vocabulary on engines without toSorted", () => {
    expect(selectVocabularyWords([], "all", "", "recent", now)).toEqual([]);
  });

  it("keeps due, learned and case-insensitive search filters", () => {
    const learned = { ...older, repetitions: 3, dueAt: "2030-01-01T00:00:00Z" };
    const words = [learned, newer];
    expect(selectVocabularyWords(words, "due", "", "recent", now)).toEqual([
      newer,
    ]);
    expect(selectVocabularyWords(words, "learned", "", "recent", now)).toEqual([
      learned,
    ]);
    for (const query of ["GRACE", "恩典", "JOHN 1:16"]) {
      expect(selectVocabularyWords(words, "all", query, "recent", now)).toEqual(
        [learned],
      );
    }
  });
});
