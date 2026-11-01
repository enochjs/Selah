export type Locale = "en" | "zh";
export type ReadingMode = "parallel" | "en" | "zh";
export type RepeatMode = "off" | "verse" | "chapter";
export type AudioTimingQuality =
  "provider-timing" | "verse-file" | "forced-alignment" | "unaligned";
export interface ChapterRecording {
  timingQuality?: AudioTimingQuality;
  alignmentStatus?: "aligned" | "partial" | "pending" | "review-required";
  alignmentIssues?: string[];
  missingVerses?: { verse: number; reason: "not-narrated-in-source" }[];
  missingFragments?: {
    verse: number;
    text: string;
    reason: "not-narrated-in-source";
  }[];
  path: string;
  duration: number;
  segments: [number, number, number][];
  verseFiles?: {
    verse: number;
    path: string;
    duration: number;
    coveredVerses?: number[];
    sourceStart?: number;
    sourceEnd?: number;
  }[];
}
export type ReviewRating = "again" | "hard" | "good" | "easy";
export interface Verse {
  number: number;
  en: string;
  zh: string;
  zhMergedInto?: number;
  zhMergedChapter?: number;
  zhOmitted?: boolean;
  zhMergedFrom?: number[];
  enOmitted?: boolean;
  enMergedInto?: { chapter: number; verse: number };
}
export interface Book {
  id: string;
  en: string;
  zh: string;
  testament: "old" | "new";
  chapters: Verse[][];
}
export interface VocabularyWord {
  id: string;
  word: string;
  meaning: string;
  note?: string;
  reference: string;
  context: string;
  createdAt: string;
  dueAt: string;
  repetitions: number;
  interval: number;
  ease: number;
}
export interface AudioTrack {
  id: string;
  title: string;
  subtitle: string;
  source: number | { uri: string };
  kind: "scripture" | "hymn";
  bookId?: string;
  chapter?: number;
  verse?: number;
  coveredVerses?: number[];
  locale?: Locale;
  artwork: number;
  duration?: number;
  startTime?: number;
  endTime?: number;
  timingQuality?: AudioTimingQuality;
  chapterAudio?: {
    source: { uri: string };
    startTime: number;
    endTime: number;
  };
}
export interface ReviewRecord {
  wordId: string;
  rating: ReviewRating;
  at: string;
}
export interface CustomSong {
  id: string;
  title: string;
  uri: string;
  addedAt: string;
}
