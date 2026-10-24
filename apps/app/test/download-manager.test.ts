import { expect, it, vi } from "vitest";
import {
  DownloadManager,
  createDownloadPlan,
  DownloadFailure,
  type OfflinePort,
  type OfflineSnapshot,
} from "../src/domain/download-manager";
import type {
  OfflineChapter,
  StoredAudioAsset,
} from "../src/domain/offline-audio";

const file = {
  path: "/api/audio/resources/" + "a".repeat(64) + ".mp3",
  size: 12,
  sha256: "a".repeat(64),
};
const second = {
  path: "/api/audio/resources/" + "b".repeat(64) + ".mp3",
  size: 8,
  sha256: "b".repeat(64),
};
const chapter: OfflineChapter = {
  key: "psalms:23:en",
  bookId: "psalms",
  chapter: 23,
  locale: "en",
  recording: { path: file.path, duration: 10, segments: [[1, 0, 10]] },
  files: [file, second],
};
function setup(snapshot: OfflineSnapshot | null = null) {
  const disk = new Map<string, StoredAudioAsset>(
    Object.entries(snapshot?.assets ?? {}),
  );
  const port: OfflinePort = {
    read: async () => snapshot,
    write: vi.fn(async () => {}),
    availableBytes: async () => 100000000,
    exists: async (asset) => disk.has(asset.path),
    remove: async (asset) => {
      disk.delete(asset.path);
    },
    resolve: async (asset) => "file:///" + asset.sha256 + ".mp3",
    download: vi.fn(async (asset, _signal, progress) => {
      progress(asset.size);
      const stored = { ...asset, uri: "offline:" + asset.sha256 };
      disk.set(asset.path, stored);
      return stored;
    }),
  };
  const manager = new DownloadManager(port, () => {});
  return { manager, port, disk };
}

it("counts unique assets and skips already verified files in overlapping chapter selections", () => {
  const saved = { ...file, uri: "offline:a" };
  const plan = createDownloadPlan(
    [chapter, { ...chapter, key: "psalms:24:en" }],
    { [file.path]: saved },
    1000,
  );
  expect(plan.totalBytes).toBe(20);
  expect(plan.bytes).toBe(8);
});

it("downloads a chapter completely and resolves media locally without a server", async () => {
  const { manager, port } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key]?.status).toBe(
      "complete",
    ),
  );
  expect(port.download).toHaveBeenCalledTimes(2);
  expect(
    await manager.resolveSource({
      uri: "http://unreachable.invalid" + file.path,
    }),
  ).toEqual({ uri: "file:///" + file.sha256 + ".mp3" });
});

it("waits for Wi-Fi and does not restart manually paused tasks on network changes", async () => {
  const { manager, port } = setup();
  await manager.initialize();
  manager.setNetwork("other");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("waiting");
  expect(port.download).not.toHaveBeenCalled();
  await manager.pause([chapter.key]);
  manager.setNetwork("wifi");
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("paused");
  await manager.resume([chapter.key]);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
});

it("restores interrupted tasks paused and preserves completed chapters", async () => {
  const { manager } = setup({
    chapters: { [chapter.key]: { ...chapter, status: "downloading" } },
    assets: {},
    wifiOnly: true,
  });
  await manager.initialize();
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("paused");
  expect(manager.getSnapshot().ready).toBe(true);
});

it("never marks a corrupt or missing download complete and can retry", async () => {
  const { manager, port } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  vi.mocked(port.download).mockRejectedValueOnce(
    new DownloadFailure("integrity"),
  );
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key]?.error).toBe(
      "integrity",
    ),
  );
  expect(manager.getSnapshot().assets[file.path]).toBeUndefined();
  await manager.resume([chapter.key]);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
});

it("refuses a download when free storage is insufficient", async () => {
  const { manager, port } = setup();
  port.availableBytes = async () => 10;
  await manager.initialize();
  await expect(
    manager.enqueue(createDownloadPlan([chapter], {}, null), true),
  ).rejects.toMatchObject({ code: "storage" });
  expect(port.download).not.toHaveBeenCalled();
});

it("rechecks evicted files before confirming and enqueueing another download", async () => {
  const { manager, port, disk } = setup({
    chapters: { [chapter.key]: { ...chapter, status: "complete" } },
    assets: Object.fromEntries(
      chapter.files.map((asset) => [
        asset.path,
        { ...asset, uri: "offline:" + asset.sha256 },
      ]),
    ),
    wifiOnly: true,
  });
  await manager.initialize();
  disk.delete(file.path);
  const plan = await manager.prepare([chapter]);
  expect(plan.bytes).toBe(file.size);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("failed");
  manager.setNetwork("wifi");
  await manager.enqueue(plan, true);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
  expect(port.download).toHaveBeenCalledOnce();
  expect(disk.has(file.path)).toBe(true);
});

it("rechecks files evicted while a chapter waits in the queue", async () => {
  const { manager, port, disk } = setup({
    chapters: {},
    assets: { [file.path]: { ...file, uri: "offline:a" } },
    wifiOnly: true,
  });
  await manager.initialize();
  await manager.enqueue(
    createDownloadPlan([chapter], manager.getSnapshot().assets, null),
    true,
  );
  disk.delete(file.path);
  manager.setNetwork("wifi");
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
  expect(port.download).toHaveBeenCalledTimes(2);
});

it("resumes transport failures after an offline network event arrives", async () => {
  const { manager, port } = setup();
  await manager.initialize();
  manager.setNetwork("wifi");
  vi.mocked(port.download).mockRejectedValueOnce(
    new DownloadFailure("network"),
  );
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].error).toBe("network"),
  );
  manager.setNetwork("offline");
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("waiting");
  manager.setNetwork("wifi");
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
});

it("removing one chapter retains shared audio referenced by another", async () => {
  const stored = { ...file, uri: "offline:a" };
  const other = { ...chapter, key: "psalms:24:en", chapter: 24, files: [file] };
  const { manager, disk } = setup({
    chapters: {
      [chapter.key]: { ...chapter, status: "complete" },
      [other.key]: { ...other, status: "complete" },
    },
    assets: { [file.path]: stored },
    wifiOnly: true,
  });
  await manager.initialize();
  await manager.remove([chapter.key]);
  expect(disk.has(file.path)).toBe(true);
  expect(manager.getSnapshot().chapters[other.key]).toBeDefined();
});
it("removes paused partial files even when no completed asset was registered", async () => {
  const { manager, port } = setup({
    chapters: { [chapter.key]: { ...chapter, status: "paused" } },
    assets: {},
    wifiOnly: true,
  });
  port.remove = vi.fn(async () => {});
  await manager.initialize();
  await manager.remove([chapter.key]);
  expect(port.remove).toHaveBeenCalledTimes(2);
});
it("preserves another chapter finishing while a deletion is in progress", async () => {
  const a = { ...chapter, files: [file] };
  const b = { ...chapter, key: "psalms:24:en", chapter: 24, files: [second] };
  const { manager, port, disk } = setup({
    chapters: {
      [a.key]: { ...a, status: "complete" },
      [b.key]: { ...b, status: "paused" },
    },
    assets: { [file.path]: { ...file, uri: "offline:a" } },
    wifiOnly: true,
  });
  let finishDownload!: () => void, finishRemove!: () => void;
  const downloading = new Promise<void>((resolve) => {
    finishDownload = resolve;
  });
  const removing = new Promise<void>((resolve) => {
    finishRemove = resolve;
  });
  port.download = vi.fn(async (asset) => {
    await downloading;
    const saved = { ...asset, uri: "offline:b" };
    disk.set(asset.path, saved);
    return saved;
  });
  port.remove = vi.fn(async (asset) => {
    await removing;
    disk.delete(asset.path);
  });
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.resume([b.key]);
  await vi.waitFor(() => expect(port.download).toHaveBeenCalledOnce());
  const deletion = manager.remove([a.key]);
  await vi.waitFor(() => expect(port.remove).toHaveBeenCalledOnce());
  finishDownload();
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[b.key]?.status).toBe("complete"),
  );
  finishRemove();
  await deletion;
  expect(manager.getSnapshot().chapters[b.key].status).toBe("complete");
  expect(manager.getSnapshot().assets[second.path]).toBeDefined();
});
