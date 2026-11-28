export interface EnglishLesson {
  id: string;
  date: string;
  title: string;
  stage: number;
  duration: number;
  sha256: string;
  chapters: { start: number; prompt: string }[];
  phrases: { text: string; purpose: string }[];
  practice: string;
  source: { credit: string; url: string; excerpt: string };
}

export interface LessonProgress {
  revision: string;
  time: number;
  completed: boolean;
}

const beijingDate = new Intl.DateTimeFormat("en", {
  timeZone: "Asia/Shanghai",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function beijingLessonDate(now = new Date()): string {
  const parts = beijingDate.formatToParts(now);
  return ["year", "month", "day"]
    .map((kind) => parts.find((part) => part.type === kind)?.value)
    .join("-");
}

export function selectAvailableLessons<T extends { date: string }>(
  lessons: readonly T[],
  date: string,
): T[] {
  return lessons
    .filter((lesson) => lesson.date <= date)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export function lessonCheckpoint(
  previous: LessonProgress | undefined,
  revision: string,
  time: number,
  duration: number,
  finished: boolean,
): LessonProgress {
  return {
    revision,
    time: finished
      ? Math.round(duration)
      : Math.floor(Math.max(0, Math.min(time, duration))),
    completed:
      finished || (previous?.revision === revision && previous.completed),
  };
}

export function resumeLessonAt(
  progress: LessonProgress | undefined,
  revision: string,
  duration: number,
): number {
  if (
    progress?.revision !== revision ||
    !Number.isFinite(progress.time) ||
    progress.time >= duration - 1
  ) {
    return 0;
  }
  return Math.max(0, progress.time);
}

export function lessonTime(seconds: number): string {
  const rounded = Math.round(seconds);
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
}
