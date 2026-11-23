import { resourceUrl } from "../config/resources";
import type { EnglishLesson } from "../domain/english-lessons";

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isLesson(input: unknown): input is EnglishLesson {
  if (
    !record(input) ||
    typeof input.id !== "string" ||
    !/^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/.test(input.id) ||
    input.id.slice(0, 10) !== input.date ||
    typeof input.title !== "string" ||
    typeof input.stage !== "number" ||
    ![1, 2, 3].includes(input.stage) ||
    typeof input.duration !== "number" ||
    !Number.isFinite(input.duration) ||
    input.duration <= 0 ||
    typeof input.sha256 !== "string" ||
    !/^[a-f0-9]{64}$/.test(input.sha256)
  ) {
    return false;
  }
  const duration = input.duration;
  const { chapters, phrases, source } = input;
  let previous = -1;
  return (
    Array.isArray(chapters) &&
    chapters.length === 4 &&
    chapters[0]?.start === 0 &&
    chapters.every((chapter) => {
      if (
        !record(chapter) ||
        typeof chapter.start !== "number" ||
        !Number.isInteger(chapter.start) ||
        chapter.start <= previous ||
        chapter.start >= duration ||
        typeof chapter.prompt !== "string"
      ) {
        return false;
      }
      previous = chapter.start;
      return true;
    }) &&
    Array.isArray(phrases) &&
    phrases.every(
      (phrase) =>
        record(phrase) &&
        typeof phrase.text === "string" &&
        typeof phrase.purpose === "string",
    ) &&
    typeof input.practice === "string" &&
    record(source) &&
    typeof source.credit === "string" &&
    typeof source.excerpt === "string" &&
    typeof source.url === "string" &&
    /^https:\/\/[^\s/]+\//.test(source.url)
  );
}

export async function fetchEnglishLessons(): Promise<EnglishLesson[]> {
  const url = resourceUrl("/api/english-lessons");
  if (!url) throw new Error("Missing resource server URL");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new Error("Course catalog unavailable");
    const payload: unknown = await response.json();
    if (
      !record(payload) ||
      payload.version !== 1 ||
      !Array.isArray(payload.lessons)
    ) {
      throw new Error("Invalid course catalog");
    }
    return payload.lessons.filter(isLesson);
  } finally {
    clearTimeout(timeout);
  }
}

export function englishLessonVideo(lesson: EnglishLesson): string | null {
  return resourceUrl(`/api/english-lessons/video/${lesson.sha256}.mp4`);
}
