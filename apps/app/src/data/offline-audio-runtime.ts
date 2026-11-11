import { createOfflinePort } from "./offline-storage";
import { DownloadManager, DownloadFailure } from "../domain/download-manager";
import { offlineChapters, parseDownloadManifest } from "./offline-catalog";
import type { DownloadScope } from "../domain/offline-audio";
import type { Locale } from "../domain/models";
import type { PublishedHymn } from "../domain/hymns";
import { offlineHymn } from "./hymn-downloads";
import { resourceUrl } from "../config/resources";
import { DownloadBackgroundController } from "./download-background";
import {
  downloadBackgroundPort,
  onBackgroundDownloadPause,
  prepareBackgroundDownloads,
} from "./download-background-port";

const listeners = new Set<() => void>();
const port = createOfflinePort();
const background = new DownloadBackgroundController(downloadBackgroundPort);
export const downloadManager = new DownloadManager(port, (state) => {
  listeners.forEach((listener) => listener());
  try {
    background.update(state);
  } catch (error) {
    console.warn("Could not keep audio downloads running in background", error);
  }
});
onBackgroundDownloadPause(() => {
  const keys = Object.values(downloadManager.getSnapshot().chapters)
    .filter((chapter) =>
      ["queued", "downloading", "waiting"].includes(chapter.status),
    )
    .map((chapter) => chapter.key);
  void downloadManager.pause(keys).catch((error: unknown) => {
    console.warn("Could not save paused audio downloads", error);
  });
});
export async function enqueueDownloads(
  plan: Parameters<DownloadManager["enqueue"]>[0],
  wifiOnly: boolean,
) {
  await prepareBackgroundDownloads();
  await downloadManager.enqueue(plan, wifiOnly);
}
export async function resumeDownloads(keys: string[]) {
  await prepareBackgroundDownloads();
  await downloadManager.resume(keys);
}
export function subscribeDownloads(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
let initialization: Promise<void> | null = null;
export function initializeDownloads() {
  initialization ??= downloadManager.initialize().catch((error: unknown) => {
    initialization = null;
    throw error;
  });
  return initialization;
}
export async function prepareDownloads(scope: DownloadScope, locale: Locale) {
  const url = resourceUrl("/api/audio/download-manifest?mode=chapter");
  if (!url) throw new DownloadFailure("unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) throw new DownloadFailure("unavailable");
    const manifest = parseDownloadManifest(await response.json());
    const chapters = offlineChapters(scope, locale, manifest);
    return downloadManager.prepare(chapters);
  } finally {
    clearTimeout(timeout);
  }
}
export async function prepareHymnDownload(hymn: PublishedHymn) {
  // Validate the publication before constructing a resource URL or making I/O.
  offlineHymn(hymn, "1");
  const url = resourceUrl(hymn.audioPath);
  if (!url) throw new DownloadFailure("unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new DownloadFailure("unavailable");
    return await downloadManager.prepare([
      offlineHymn(hymn, response.headers.get("content-length")),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}
