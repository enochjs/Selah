import { afterEach, expect, it, vi } from "vitest";
import { DownloadCheckpoint } from "../src/domain/download-checkpoint";
import type { OfflineSnapshot } from "../src/domain/download-manager";
const snapshot: OfflineSnapshot = { chapters: {}, assets: {}, wifiOnly: true };
afterEach(() => vi.useRealTimers());
it("flushes eight completions together and flushes remaining dirty records after 500ms", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async () => {});
  const checkpoint = new DownloadCheckpoint(() => snapshot, write, vi.fn());
  for (let i = 0; i < 7; i++) {
    checkpoint.asset(String(i));
    checkpoint.completed();
  }
  expect(write).not.toHaveBeenCalled();
  checkpoint.asset("7");
  checkpoint.completed();
  await vi.advanceTimersByTimeAsync(0);
  expect(write).toHaveBeenCalledTimes(1);
  checkpoint.asset("8");
  checkpoint.completed();
  await vi.advanceTimersByTimeAsync(499);
  expect(write).toHaveBeenCalledTimes(1);
  await vi.advanceTimersByTimeAsync(1);
  expect(write).toHaveBeenCalledTimes(2);
});
it("retains dirty keys after failed write and reports scheduled persistence errors", async () => {
  vi.useFakeTimers();
  const write = vi.fn(async () => {}),
    failed = vi.fn();
  write.mockRejectedValueOnce(new Error("disk full"));
  const checkpoint = new DownloadCheckpoint(() => snapshot, write, failed);
  checkpoint.asset("a");
  checkpoint.completed();
  await vi.advanceTimersByTimeAsync(500);
  expect(failed).toHaveBeenCalledOnce();
  checkpoint.asset("b");
  await checkpoint.flush();
  expect(write).toHaveBeenLastCalledWith(snapshot, {
    assets: ["a", "b"],
    chapters: [],
  });
});
it("serializes writes while retaining changes received during a pending write", async () => {
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const write = vi.fn(async () => {});
  write.mockImplementationOnce(() => pending);
  const checkpoint = new DownloadCheckpoint(() => snapshot, write, vi.fn());
  checkpoint.chapter("one");
  const first = checkpoint.flush();
  await Promise.resolve();
  await Promise.resolve();
  checkpoint.asset("second");
  const second = checkpoint.flush();
  expect(write).toHaveBeenCalledTimes(1);
  release();
  await first;
  await second;
  expect(write).toHaveBeenLastCalledWith(snapshot, {
    chapters: [],
    assets: ["second"],
  });
});
