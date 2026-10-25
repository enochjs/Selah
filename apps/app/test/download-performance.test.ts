import { afterEach, expect, it, vi } from "vitest";
import {
  DownloadManager,
  createDownloadPlan,
  type OfflinePort,
} from "../src/domain/download-manager";
import type {
  OfflineChapter,
  StoredAudioAsset,
} from "../src/domain/offline-audio";

const chapter: OfflineChapter = {
  key: "genesis:1:en",
  bookId: "genesis",
  chapter: 1,
  locale: "en",
  recording: { path: "/chapter", duration: 100, segments: [] },
  files: Array.from({ length: 32 }, (_, i) => ({
    path: `/file-${i}`,
    sha256: i.toString(16).padStart(64, "0"),
    size: 100,
  })),
};
function setup(concurrency = 4) {
  const disk = new Map<string, StoredAudioAsset>();
  let active = 0,
    peak = 0;
  const port: OfflinePort = {
    read: async () => null,
    write: vi.fn(async () => {}),
    availableBytes: async () => 100000,
    exists: async (asset) => disk.has(asset.path),
    resolve: async (asset) => asset.uri,
    remove: async (asset) => {
      disk.delete(asset.path);
    },
    download: vi.fn(async (asset, signal, progress) => {
      active++;
      peak = Math.max(peak, active);
      try {
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 100);
          signal.addEventListener(
            "abort",
            () => {
              clearTimeout(timer);
              reject(new Error("aborted"));
            },
            { once: true },
          );
        });
        progress(asset.size);
        const stored = { ...asset, uri: asset.path };
        disk.set(asset.path, stored);
        return stored;
      } finally {
        active--;
      }
    }),
  };
  const changed = vi.fn();
  const manager = new DownloadManager(port, changed, { concurrency });
  return { manager, port, changed, peak: () => peak, active: () => active };
}
afterEach(() => vi.useRealTimers());

it("limits downloads to four, replenishes slots, and batches durable writes", async () => {
  vi.useFakeTimers();
  const { manager, port, peak } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(port.download).toHaveBeenCalledTimes(4);
  await vi.advanceTimersByTimeAsync(100);
  expect(port.download).toHaveBeenCalledTimes(8);
  await vi.advanceTimersByTimeAsync(700);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
  expect(peak()).toBe(4);
  expect(vi.mocked(port.write).mock.calls.length).toBeLessThan(12);
});

it("makes bounded concurrency faster than serial under identical request latency", async () => {
  vi.useFakeTimers();
  async function run(concurrency: number) {
    const { manager } = setup(concurrency);
    await manager.initialize();
    manager.setNetwork("wifi");
    const start = Date.now();
    await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
    while (manager.getSnapshot().chapters[chapter.key].status !== "complete")
      await vi.advanceTimersByTimeAsync(100);
    return Date.now() - start;
  }
  const serial = await run(1),
    parallel = await run(4);
  expect(serial).toBe(3200);
  expect(parallel).toBe(800);
});

it("cancels all active files before pause returns and does not dispatch more", async () => {
  vi.useFakeTimers();
  const { manager, port, active } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(0);
  expect(active()).toBe(4);
  await manager.pause([chapter.key]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(active()).toBe(0);
  expect(port.download).toHaveBeenCalledTimes(4);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("paused");
  manager.setNetwork("wifi");
  await vi.advanceTimersByTimeAsync(1000);
  expect(port.download).toHaveBeenCalledTimes(4);
});

it("aborts sibling files on failure, keeps verified assets and waits before the next chapter", async () => {
  vi.useFakeTimers();
  const { manager, port, active } = setup();
  const original = vi.mocked(port.download).getMockImplementation()!;
  vi.mocked(port.download).mockImplementation(
    async (asset, signal, progress) => {
      if (asset.path === chapter.files[0].path) {
        await new Promise((resolve) => setTimeout(resolve, 1));
        throw new Error("failed transfer");
      }
      return original(asset, signal, progress);
    },
  );
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(1);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("failed");
  expect(active()).toBe(0);
  expect(port.download).toHaveBeenCalledTimes(4);
});

it("throttles byte-only notifications while publishing the latest concurrent bytes", async () => {
  vi.useFakeTimers();
  const { manager, port, changed } = setup();
  const callbacks: ((bytes: number) => void)[] = [];
  vi.mocked(port.download).mockImplementation(
    async (asset, signal, progress) => {
      callbacks.push(progress);
      await new Promise<void>((_resolve, reject) =>
        signal.addEventListener("abort", () => reject(new Error("paused")), {
          once: true,
        }),
      );
      return { ...asset, uri: asset.path };
    },
  );
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(0);
  changed.mockClear();
  for (let byte = 1; byte <= 90; byte++)
    callbacks.forEach((progress) => progress(byte));
  expect(changed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(199);
  expect(changed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(changed).toHaveBeenCalledOnce();
  expect(Object.values(manager.getSnapshot().transfers)).toEqual([
    90, 90, 90, 90,
  ]);
  await manager.pause([chapter.key]);
});

it("reserves free space across active workers and cancels them on insufficient storage", async () => {
  vi.useFakeTimers();
  const { manager, port, peak } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  vi.mocked(port.download).mockImplementation(async (asset, signal) => {
    await new Promise<void>((_resolve, reject) =>
      signal.addEventListener("abort", () => reject(new Error("paused")), {
        once: true,
      }),
    );
    return { ...asset, uri: asset.path };
  });
  port.availableBytes = async () => 200;
  await vi.advanceTimersByTimeAsync(0);
  expect(port.download).toHaveBeenCalledTimes(2);
  expect(manager.getSnapshot().chapters[chapter.key].error).toBe("storage");
  expect(peak()).toBe(0);
});

it("waits for Wi-Fi after aborting every in-flight file", async () => {
  vi.useFakeTimers();
  const { manager, port, active } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(0);
  manager.setNetwork("other");
  await vi.advanceTimersByTimeAsync(1000);
  expect(active()).toBe(0);
  expect(port.download).toHaveBeenCalledTimes(4);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("waiting");
  manager.setNetwork("wifi");
  await vi.advanceTimersByTimeAsync(800);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
});

it("exposes a checkpoint write failure and retries dirty assets without downloading twice", async () => {
  vi.useFakeTimers();
  const { manager, port } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.advanceTimersByTimeAsync(0);
  vi.mocked(port.write).mockRejectedValueOnce(new Error("disk full"));
  await vi.advanceTimersByTimeAsync(200);
  expect(manager.getSnapshot().chapters[chapter.key].error).toBe("storage");
  const savedCount = Object.keys(manager.getSnapshot().assets).length;
  expect(savedCount).toBeGreaterThanOrEqual(8);
  await manager.resume([chapter.key]);
  await vi.advanceTimersByTimeAsync(1000);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
  expect(Object.keys(manager.getSnapshot().assets)).toHaveLength(32);
  expect(
    vi
      .mocked(port.download)
      .mock.calls.filter(([asset]) => asset.path === chapter.files[0].path),
  ).toHaveLength(1);
});
