import { expect, it } from "vitest";
import { DownloadProgress } from "../src/domain/download-progress";
import type { OfflineState } from "../src/domain/offline-audio";
const one = { path: "/one", sha256: "a", size: 100 },
  two = { path: "/two", sha256: "b", size: 100 };
function state(): OfflineState {
  return {
    ready: true,
    wifiOnly: true,
    network: "wifi",
    transfers: { "/one": 25, "/two": 50 },
    assets: {},
    chapters: {
      en: {
        key: "en",
        bookId: "psalms",
        chapter: 23,
        locale: "en",
        files: [one, two, one],
        status: "downloading",
        recording: { path: one.path, duration: 1, segments: [] },
      },
    },
  };
}
it("sums parallel progress, deduplicates files, clamps bytes and counts verified assets once", () => {
  const progress = new DownloadProgress(),
    snapshot = state();
  expect(progress.select(snapshot).receivedBytes).toBe(75);
  const saved = {
    ...snapshot,
    assets: { [one.path]: { ...one, uri: "local" } },
    transfers: { "/one": 100, "/two": 200 },
  };
  expect(progress.select(saved)).toEqual({
    totalBytes: 200,
    receivedBytes: 200,
    storedBytes: 100,
  });
  expect(
    progress.select({ ...saved, transfers: { "/two": -20 } }).receivedBytes,
  ).toBe(100);
});
it("reuses file membership and completed totals for progress-only events and separates languages", () => {
  const progress = new DownloadProgress(),
    snapshot = state();
  let reads = 0;
  Object.defineProperty(snapshot.chapters.en, "files", {
    get() {
      reads++;
      return [one, two];
    },
  });
  progress.select(snapshot, "en");
  const before = reads;
  expect(
    progress.select({ ...snapshot, transfers: { "/one": 40 } }, "en")
      .receivedBytes,
  ).toBe(40);
  expect(reads).toBe(before);
  expect(progress.select(snapshot, "zh").totalBytes).toBe(0);
});
