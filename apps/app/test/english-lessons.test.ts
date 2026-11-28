import { expect, it } from "vitest";
import {
  beijingLessonDate,
  lessonCheckpoint,
  resumeLessonAt,
  selectAvailableLessons,
} from "../src/domain/english-lessons";

it("picks lessons by the Beijing date and sorts the latest available course first", () => {
  const today = beijingLessonDate(new Date("2026-11-22T16:01:00Z"));
  const lessons = selectAvailableLessons(
    [{ date: "2026-11-22" }, { date: "2026-11-24" }, { date: "2026-11-23" }],
    today,
  );
  expect(today).toBe("2026-11-23");
  expect(lessons.map(({ date }) => date)).toEqual(["2026-11-23", "2026-11-22"]);
});

it("restores progress for the same video and starts a replacement from the beginning", () => {
  const progress = lessonCheckpoint(undefined, "original", 133.9, 245, false);
  expect(progress).toEqual({
    revision: "original",
    time: 133,
    completed: false,
  });
  expect(resumeLessonAt(progress, "original", 245)).toBe(133);
  expect(resumeLessonAt(progress, "new-edit", 245)).toBe(0);
});

it("keeps a completed lesson completed when a learner repeats a section", () => {
  const finished = lessonCheckpoint(undefined, "original", 245, 245, true);
  const replay = lessonCheckpoint(finished, "original", 49, 245, false);
  expect(replay.completed).toBe(true);
  expect(resumeLessonAt(finished, "original", 245)).toBe(0);
  expect(resumeLessonAt(replay, "original", 245)).toBe(49);
});
