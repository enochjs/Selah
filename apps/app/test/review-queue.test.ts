import { it, expect } from "vitest";
import { createWord, reviewQueue } from "../src/domain/vocabulary";
import type { ReviewRecord } from "../src/domain/models";
it("allows forgotten cards after 10 minutes even when today’s introduction limit is reached", () => {
  const now = new Date("2026-10-20T08:11:00Z");
  const word = {
    ...createWord("shepherd", "", "", "", now),
    dueAt: "2026-10-20T08:10:00Z",
  };
  const reviews: ReviewRecord[] = [
    { wordId: word.id, rating: "again", at: "2026-10-20T08:00:00Z" },
  ];
  expect(reviewQueue([word], reviews, 1, now).map((w) => w.id)).toEqual([
    "shepherd",
  ]);
});
it("prioritizes relearning and prevents unseen cards from exceeding the daily quota", () => {
  const now = new Date("2026-10-20T08:11:00Z");
  const word = {
    ...createWord("forgotten", "", "", "", now),
    dueAt: "2026-10-20T08:10:00Z",
  };
  const unseen = createWord("new", "", "", "", now);
  const reviews: ReviewRecord[] = [
    { wordId: word.id, rating: "again", at: "2026-10-20T08:00:00Z" },
  ];
  expect(reviewQueue([unseen, word], reviews, 1, now).map((w) => w.id)).toEqual(
    ["forgotten"],
  );
});
it("does not include forgotten cards before they are due", () => {
  const now = new Date("2026-10-20T08:05:00Z");
  const word = {
    ...createWord("waiting", "", "", "", now),
    dueAt: "2026-10-20T08:10:00Z",
  };
  const reviews: ReviewRecord[] = [
    { wordId: word.id, rating: "again", at: "2026-10-20T08:00:00Z" },
  ];
  expect(reviewQueue([word], reviews, 1, now)).toHaveLength(0);
});
