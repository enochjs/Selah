import type { ChapterRecording, Locale } from "./models";
import type { PublishedHymn } from "./hymns";

export interface DownloadAsset {
  path: string;
  size: number;
  sha256: string;
}
export interface StoredAudioAsset extends DownloadAsset {
  uri: string;
}
export interface OfflineChapter {
  kind?: "scripture";
  key: string;
  bookId: string;
  chapter: number;
  locale: Locale;
  recording: ChapterRecording;
  files: DownloadAsset[];
}
export interface OfflineHymn {
  kind: "hymn";
  key: string;
  hymn: PublishedHymn;
  files: DownloadAsset[];
}
export type OfflineAudioItem = OfflineChapter | OfflineHymn;
export type DownloadStatus =
  "queued" | "downloading" | "paused" | "waiting" | "failed" | "complete";
export type DownloadError =
  "network" | "storage" | "integrity" | "unavailable" | "download";
export interface ChapterDownload extends OfflineChapter {
  status: DownloadStatus;
  error?: DownloadError;
}
export interface HymnDownload extends OfflineHymn {
  status: DownloadStatus;
  error?: DownloadError;
}
export type AudioDownload = ChapterDownload | HymnDownload;
export interface OfflineState {
  ready: boolean;
  // Preserve the existing on-disk index and chapter keys during migration.
  chapters: Record<string, AudioDownload>;
  assets: Record<string, StoredAudioAsset>;
  wifiOnly: boolean;
  transfers: Record<string, number>;
  network: "wifi" | "other" | "offline" | "unknown";
}
export type DownloadScope =
  | { kind: "all" | "old" | "new" }
  | { kind: "book"; bookId: string }
  | { kind: "chapter"; bookId: string; chapter: number };
export interface DownloadPlan {
  chapters: OfflineAudioItem[];
  bytes: number;
  totalBytes: number;
  availableBytes: number | null;
}
export interface OfflineAudioContextValue {
  state: OfflineState;
  initializationError: boolean;
  retryInitialization(): void;
  prepare(scope: DownloadScope, locale: Locale): Promise<DownloadPlan>;
  prepareHymn(hymn: PublishedHymn): Promise<DownloadPlan>;
  enqueue(plan: DownloadPlan, wifiOnly: boolean): Promise<void>;
  pause(keys: string[]): Promise<void>;
  resume(keys: string[]): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
