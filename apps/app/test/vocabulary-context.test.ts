import { expect, it } from "vitest";
import { vocabularyTranslation } from "../src/data/vocabulary-context";
import { bibleRepository } from "../src/data/bible-repository";

it("shows the existing Chinese counterpart of the selected English passage", () => {
  const verse = bibleRepository.getChapter("psalms", 23)[0];
  expect(vocabularyTranslation("Psalms 23:1", verse.en)).toBe(verse.zh);
});
it("does not attach a new translation to an old saved sentence or invalid reference", () => {
  expect(
    vocabularyTranslation(
      "Psalms 23:1",
      "The LORD is my shepherd; I shall not want.",
    ),
  ).toBeNull();
  expect(vocabularyTranslation("", "a personal example")).toBeNull();
  expect(vocabularyTranslation("Unknown 23:1", "example")).toBeNull();
});
