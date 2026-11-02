export interface DailyVerseReference {
  bookId: string;
  chapter: number;
  verse: number;
  endVerse?: number;
}
export interface DailyVerseImage {
  id: string;
  file: string;
  sha256: string;
  author: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  width: number;
  height: number;
  theme: string;
}
export interface DailyVerseEntry {
  id: string;
  date: string;
  reference: DailyVerseReference;
  imageId: string;
  theme: string;
  status: "draft" | "approved" | "withdrawn";
  reviewedAt?: string;
  reviewedBy?: string;
}
export interface DailyVerseCatalog {
  revision: number;
  images: DailyVerseImage[];
  items: DailyVerseEntry[];
}
export function isDateKey(value: unknown): boolean;
export function localDateKey(date?: Date): string;
export function addDays(date: string, days: number): string;
export function parseDailyVerseCatalog(value: unknown): DailyVerseCatalog;
export function selectDailyVerse(
  catalog: DailyVerseCatalog,
  date: string,
): { entry: DailyVerseEntry | null; stale: boolean };
export function publishedDailyVerseCatalog(
  catalog: DailyVerseCatalog,
): DailyVerseCatalog;
