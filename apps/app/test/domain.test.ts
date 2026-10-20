import { describe, it, expect } from "vitest";
import {
  createWord,
  scheduleReview,
  dueWords,
  dailyQueue,
  forecast,
  normalizeWord,
} from "../src/domain/vocabulary";
import { nextTrackIndex } from "../src/domain/playback";

const now = new Date("2026-10-20T08:00:00Z");
describe("Spaced repetition", () => {
  it("normalizes words, preserving internal apostrophes", () => {
    expect(normalizeWord(" “Shepherd,” ")).toBe("shepherd");
    expect(normalizeWord("man's")).toBe("man's");
  });
  it("new words are due immediately", () => {
    const word = createWord(
      "Shepherd",
      "牧人",
      "Psalm 23:1",
      "The Lord is my shepherd.",
      now,
    );
    expect(dueWords([word], now)).toHaveLength(1);
    expect(word.repetitions).toBe(0);
  });
  it("good recall schedules 1 day, then 6 days, then a growing interval", () => {
    const first = scheduleReview(
      createWord("grace", "恩典", "John 1:16", "", now),
      "good",
      now,
    );
    expect(first.interval).toBe(1);
    expect(first.dueAt).toBe("2026-10-21T08:00:00.000Z");
    const second = scheduleReview(first, "good", new Date(first.dueAt));
    expect(second.interval).toBe(6);
    const third = scheduleReview(second, "good", new Date(second.dueAt));
    expect(third.interval).toBeGreaterThan(6);
  });
  it("forgotten words reset and return in ten minutes", () => {
    const word = {
      ...createWord("light", "光", "John 1:4", "", now),
      repetitions: 5,
      interval: 30,
    };
    const result = scheduleReview(word, "again", now);
    expect(result.repetitions).toBe(0);
    expect(result.dueAt).toBe("2026-10-20T08:10:00.000Z");
    expect(word.repetitions).toBe(5);
  });
  it("respects daily limit and excludes future cards", () => {
    const words = Array.from({ length: 8 }, (_, n) =>
      createWord(`word${n}`, "", "", "", now),
    );
    words.push({
      ...createWord("future", "", "", "", now),
      dueAt: "2030-01-01T00:00:00Z",
    });
    expect(dailyQueue(words, 5, now)).toHaveLength(5);
    expect(dailyQueue(words, 5, now).some((w) => w.word === "future")).toBe(
      false,
    );
  });
  it("forecast includes overdue cards in today and future cards on their local day", () => {
    const overdue = {
      ...createWord("a", "", "", "", now),
      dueAt: "2026-10-19T00:00:00Z",
    };
    expect(forecast([overdue], now, 7)[0].count).toBe(1);
  });
});
describe("Audio sequencing and exact verse loops", () => {
  it("verse repeat stays on selected verse", () =>
    expect(nextTrackIndex(3, 6, "verse")).toBe(3));
  it("advances until chapter ends, then stops", () => {
    expect(nextTrackIndex(3, 6, "off")).toBe(4);
    expect(nextTrackIndex(5, 6, "off")).toBeNull();
  });
  it("chapter repeat wraps to first verse", () =>
    expect(nextTrackIndex(5, 6, "chapter")).toBe(0));
  it("an empty queue stops immediately", () =>
    expect(nextTrackIndex(0, 0, "chapter")).toBeNull());
  it("out of range track indexes stop safely", () => {
    expect(nextTrackIndex(-1, 6, "off")).toBeNull();
    expect(nextTrackIndex(6, 6, "verse")).toBeNull();
  });
});
