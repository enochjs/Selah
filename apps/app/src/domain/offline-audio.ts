import type { ChapterRecording, Locale } from "./models";

export interface DownloadAsset {
  path: string;
  size: number;
  sha256: string;
}
export interface StoredAudioAsset extends DownloadAsset {
  uri: string;
}
export interface OfflineChapter {
  key: string;
  bookId: string;
  chapter: number;
  locale: Locale;
  recording: ChapterRecording;
  files: DownloadAsset[];
}
export type DownloadStatus =
  "queued" | "downloading" | "paused" | "waiting" | "failed" | "complete";
export type DownloadError =
  "network" | "storage" | "integrity" | "unavailable" | "download";
export interface ChapterDownload extends OfflineChapter {
  status: DownloadStatus;
  error?: DownloadError;
}
export interface OfflineState {
  ready: boolean;
  chapters: Record<string, ChapterDownload>;
  assets: Record<string, StoredAudioAsset>;
  wifiOnly: boolean;
  activePath: string | null;
  activeBytes: number;
  network: "wifi" | "other" | "offline" | "unknown";
}
export type DownloadScope =
  | { kind: "all" | "old" | "new" }
  | { kind: "book"; bookId: string }
  | { kind: "chapter"; bookId: string; chapter: number };
export interface DownloadPlan {
  chapters: OfflineChapter[];
  bytes: number;
  totalBytes: number;
  availableBytes: number | null;
}
export interface OfflineAudioContextValue {
  state: OfflineState;
  prepare(scope: DownloadScope, locale: Locale): Promise<DownloadPlan>;
  enqueue(plan: DownloadPlan, wifiOnly: boolean): Promise<void>;
  pause(keys: string[]): Promise<void>;
  resume(keys: string[]): Promise<void>;
  remove(keys: string[]): Promise<void>;
}
