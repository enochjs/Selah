export interface Verse {
  number: number;
  en: string;
  zh: string;
}

export interface Book {
  id: string;
  en: string;
  zh: string;
  testament: string;
  chapters: Verse[][];
}

export interface DictionaryEntry {
  meaning: string;
  phonetic: string;
  type: string;
}

export interface Review {
  status: "pending" | "approved" | "flagged";
  note: string;
  updatedAt: string;
  updatedBy: string;
}

export interface Audit {
  id: string;
  at: string;
  action: string;
  actor: string;
  target: string;
}

export interface State {
  revision: number;
  publishedRevision: number;
  dictionary: Record<string, DictionaryEntry>;
  reviews: Record<string, Review>;
  audit: Audit[];
}

export interface Recording {
  duration: number;
  path?: string;
  segments?: [number, number, number][];
  verseFiles?: {
    verse: number;
    path: string;
    duration: number;
    coveredVerses?: number[];
  }[];
  timingQuality?: string;
  alignmentStatus?: string;
  reader?: string;
  sourceUrl?: string;
}

export interface Credentials {
  username: string;
  salt: string;
  hash: string;
}

export interface Session {
  username: string;
  csrf: string;
  expires: number;
  token: string;
}
