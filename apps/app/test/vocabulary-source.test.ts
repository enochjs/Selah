import { expect, it } from "vitest";
import { matchesSavedContext } from "../src/domain/vocabulary";
it("does not play BSB narration as the saved NIV sentence", () => {
  expect(
    matchesSavedContext(
      "The Lord is my shepherd, I lack nothing.",
      "The LORD is my shepherd; I shall not want.",
    ),
  ).toBe(false);
});
it("allows the current sentence but rejects empty personal notes", () => {
  expect(matchesSavedContext("  God is love. ", "God is love.")).toBe(true);
  expect(matchesSavedContext("", "")).toBe(false);
});
