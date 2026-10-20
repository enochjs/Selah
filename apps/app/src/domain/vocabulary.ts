import type { VocabularyWord, ReviewRating, ReviewRecord } from "./models";

export function normalizeWord(word: string): string {
  return word
    .trim()
    .toLowerCase()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}
export function createWord(
  word: string,
  meaning: string,
  reference: string,
  context: string,
  now = new Date(),
): VocabularyWord {
  const normalized = normalizeWord(word);
  return {
    id: normalized,
    word: normalized,
    meaning: meaning.trim(),
    reference,
    context,
    createdAt: now.toISOString(),
    dueAt: now.toISOString(),
    repetitions: 0,
    interval: 0,
    ease: 2.5,
  };
}
/** SM-2: quality 3/4/5 for hard/good/easy. A lapse returns after ten minutes. */
export function scheduleReview(
  word: VocabularyWord,
  rating: ReviewRating,
  now = new Date(),
): VocabularyWord {
  if (rating === "again")
    return {
      ...word,
      repetitions: 0,
      interval: 0,
      ease: Math.max(1.3, word.ease - 0.2),
      dueAt: new Date(now.getTime() + 600000).toISOString(),
    };
  const quality = { hard: 3, good: 4, easy: 5 }[rating];
  const ease = Math.max(
    1.3,
    word.ease + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02),
  );
  let interval =
    word.repetitions === 0
      ? 1
      : word.repetitions === 1
        ? 6
        : Math.max(word.interval + 1, Math.round(word.interval * word.ease));
  if (rating === "hard") interval = Math.max(1, Math.round(interval * 0.7));
  if (rating === "easy")
    interval = Math.max(interval + 1, Math.round(interval * 1.3));
  const due = new Date(now);
  due.setDate(due.getDate() + interval);
  return {
    ...word,
    ease,
    interval,
    repetitions: word.repetitions + 1,
    dueAt: due.toISOString(),
  };
}
export function dueWords(
  words: VocabularyWord[],
  now = new Date(),
): VocabularyWord[] {
  return words
    .filter((w) => new Date(w.dueAt).getTime() <= now.getTime())
    .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
export function dailyQueue(
  words: VocabularyWord[],
  limit: number,
  now = new Date(),
): VocabularyWord[] {
  return dueWords(words, now).slice(0, Math.max(0, Math.floor(limit)));
}
export function forecast(
  words: VocabularyWord[],
  now = new Date(),
  days = 7,
): { date: Date; count: number }[] {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);
    return {
      date,
      count: words.filter((w) => {
        const due = new Date(w.dueAt).getTime();
        return due < end.getTime() && (i === 0 || due >= date.getTime());
      }).length,
    };
  });
}
export function matchesSavedContext(saved: string, current: string): boolean {
  return !!saved.trim() && saved.trim() === current.trim();
}
export function localDateKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
/** The daily quota limits introductions, never a due ten-minute relearning step. */
export function reviewQueue(
  words: VocabularyWord[],
  reviews: ReviewRecord[],
  goal: number,
  now = new Date(),
): VocabularyWord[] {
  const today = localDateKey(now);
  const latestToday = new Map<string, ReviewRating>();
  for (const record of reviews)
    if (localDateKey(new Date(record.at)) === today)
      latestToday.set(record.wordId, record.rating);
  const due = dueWords(words, now);
  const relearning = due.filter((w) => latestToday.get(w.id) === "again");
  const unseen = due
    .filter((w) => !latestToday.has(w.id))
    .slice(0, Math.max(0, goal - latestToday.size));
  return [...relearning, ...unseen];
}
