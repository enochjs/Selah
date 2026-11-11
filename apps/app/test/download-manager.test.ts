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

function completedSnapshot(): OfflineSnapshot {
  return {
    chapters: { [chapter.key]: { ...chapter, status: "complete" } },
    assets: Object.fromEntries(
      chapter.files.map((asset) => [
        asset.path,
        { ...asset, uri: "offline:" + asset.sha256 },
      ]),
    ),
    wifiOnly: true,
  };
}

it("downloads hymns without scripture metadata, restores them and resolves local audio after restart", async () => {
  const { manager, port, disk } = setup();
  const hymn = {
    key: "hymn:new-song",
    kind: "hymn" as const,
    hymn: {
      id: "new-song",
      titleZh: "新歌",
      titleEn: "New song",
      subtitleZh: "演唱者",
      subtitleEn: "Artist",
      duration: 20,
      audioPath: file.path,
      enabled: true,
      lyrics: "[00:01]歌词",
    },
    files: [file],
  };
  manager.setNetwork("wifi");
  await manager.enqueue(await manager.prepare([hymn]), true);
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[hymn.key]?.status).toBe("complete"),
  );
  const snapshot = manager.getSnapshot();
  const restored = new DownloadManager(
    { ...port, read: async () => snapshot },
    () => {},
  );
  await restored.initialize();
  expect(restored.getSnapshot().chapters[hymn.key]).toMatchObject({
    kind: "hymn",
    hymn: { lyrics: "[00:01]歌词" },
    status: "complete",
  });
  expect(
    await restored.resolveSource({ uri: `https://example.test${file.path}` }),
  ).toEqual({ uri: `file:///${file.sha256}.mp3` });
  await restored.remove([hymn.key]);
  expect(restored.getSnapshot().chapters[hymn.key]).toBeUndefined();
  expect(disk.size).toBe(0);
});

it("keeps the physical file when a hymn and a chapter share a hash through different public paths", async () => {
  const saved = completedSnapshot();
  const hymnFile = { ...file, path: file.path.replace("resources", "hymns") };
  saved.assets[hymnFile.path] = { ...hymnFile, uri: "offline:" + file.sha256 };
  saved.chapters["hymn:shared"] = {
    kind: "hymn",
    key: "hymn:shared",
    status: "complete",
    files: [hymnFile],
    hymn: {
      id: "shared",
      titleZh: "共享",
      titleEn: "Shared",
      subtitleZh: "歌手",
      subtitleEn: "Artist",
      duration: 20,
      enabled: true,
      audioPath: hymnFile.path,
    },
  };
  const { manager, port } = setup(saved);
  port.remove = vi.fn(async () => {});
  await manager.initialize();
  await manager.remove(["hymn:shared"]);
  expect(port.remove).not.toHaveBeenCalledWith(
    expect.objectContaining({ sha256: file.sha256 }),
  );
  expect(manager.getSnapshot().assets[file.path]).toBeDefined();
  expect(manager.getSnapshot().assets[hymnFile.path]).toBeUndefined();
});
it("reuses a verified hash from another public namespace before checking free space", async () => {
  const { manager, port } = setup(completedSnapshot());
  const hymnFile = { ...file, path: file.path.replace("resources", "hymns") };
  port.availableBytes = async () => 1;
  port.recover = vi.fn(async (asset) => ({
    ...asset,
    uri: "offline:" + asset.sha256,
  }));
  await manager.initialize();
  const plan = await manager.prepare([
    {
      ...chapter,
      key: "another",
      recording: { ...chapter.recording, path: hymnFile.path },
      files: [hymnFile],
    },
  ]);
  expect(plan.bytes).toBe(0);
  expect(port.recover).toHaveBeenCalledWith(hymnFile, expect.any(AbortSignal));
  await expect(manager.enqueue(plan, true)).resolves.toBeUndefined();
});
it.each(["file", "index"])(
  "keeps the download row until %s removal succeeds, allowing visible retry on failure",
  async (failure) => {
    const { port } = setup(completedSnapshot());
    const observed: boolean[] = [];
    const manager = new DownloadManager(port, (state) =>
      observed.push(Boolean(state.chapters[chapter.key])),
    );
    await manager.initialize();
    observed.length = 0;
    if (failure === "file")
      port.remove = async () => {
        throw new Error("Cannot delete file");
      };
    else
      port.write = async (snapshot) => {
        if (!snapshot.chapters[chapter.key])
          throw new Error("Cannot save index");
      };
    await expect(manager.remove([chapter.key])).rejects.toThrow();
    expect(manager.getSnapshot().chapters[chapter.key]).toBeDefined();
    expect(observed.every(Boolean)).toBe(true);
    port.remove = async () => {};
    port.write = async () => {};
    await manager.remove([chapter.key]);
    expect(manager.getSnapshot().chapters[chapter.key]).toBeUndefined();
  },
);

it("resolves the requested offline chapter while the rest of the library is still being read", async () => {
  const { manager, port } = setup(completedSnapshot());
  let finishRead!: (saved: OfflineSnapshot) => void;
  port.read = () =>
    new Promise((resolve) => {
      finishRead = resolve;
    });
  const saved = completedSnapshot();
  Object.assign(port, {
    readAsset: vi.fn(async () => saved.assets[file.path]),
  });
  const initializing = manager.initialize();
  let resolved: unknown;
  const playback = manager
    .resolveSource({ uri: `https://example.test${file.path}` })
    .then((source) => {
      resolved = source;
    });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const beforeLibrary = resolved;
  finishRead(saved);
  await Promise.all([initializing, playback]);
  expect(beforeLibrary).toEqual({ uri: `file:///${file.sha256}.mp3` });
});

it.each(["missing", "corrupt", "error"])(
  "falls back online for a %s startup asset without waiting for unrelated files",
  async (failure) => {
    const { manager, port } = setup();
    let finishRead!: (saved: OfflineSnapshot | null) => void;
    port.read = () =>
      new Promise((resolve) => {
        finishRead = resolve;
      });
    Object.assign(port, {
      readAsset: async () => {
        if (failure === "error") throw new Error("Unreadable metadata");
        return failure === "missing"
          ? null
          : { ...file, uri: "offline:missing" };
      },
    });
    const initializing = manager.initialize();
    const source = { uri: `https://example.test${file.path}` };
    let resolved: unknown;
    const playback = manager.resolveSource(source).then((value) => {
      resolved = value;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const beforeLibrary = resolved;
    finishRead(null);
    await Promise.all([initializing, playback]);
    expect(beforeLibrary).toEqual(source);
  },
);

it("migrates saved cut-file downloads to the chapter without losing timing or cached assets", async () => {
  const saved = completedSnapshot();
  const savedChapter = saved.chapters[chapter.key];
  if (savedChapter.kind === "hymn") throw new Error("Expected scripture");
  savedChapter.recording = {
    ...savedChapter.recording,
    verseFiles: [
      {
        verse: 1,
        path: second.path,
        duration: 4,
        sourceStart: 2,
        sourceEnd: 6,
      },
    ],
  };
  delete saved.assets[second.path];
  const { manager, port } = setup(saved);
  await manager.initialize();
  const restored = manager.getSnapshot().chapters[chapter.key];
  if (restored.kind === "hymn") throw new Error("Expected scripture");
  expect(restored.status).toBe("complete");
  expect(restored.files).toEqual([file]);
  expect(restored.recording).toEqual(savedChapter.recording);
  await manager.resolveSource({ uri: `https://example.test${file.path}` });
  expect(port.download).not.toHaveBeenCalled();
});

it("shares initialization and prefers saved audio when playback starts during startup", async () => {
  const saved = completedSnapshot();
  const { manager, port } = setup(saved);
  let release!: (value: OfflineSnapshot) => void;
  const reading = new Promise<OfflineSnapshot>((resolve) => {
    release = resolve;
  });
  port.read = vi.fn(() => reading);
  const loading = manager.initialize();
  const another = manager.initialize();
  let resolved = false;
  const source = manager
    .resolveSource({ uri: "https://example.test" + file.path })
    .then((value) => {
      resolved = true;
      return value;
    });
  await new Promise((resolve) => setTimeout(resolve, 0));
  const resolvedBeforeRead = resolved;
  const reads = vi.mocked(port.read).mock.calls.length;
  release(saved);
  await Promise.all([loading, another]);
  expect(await source).toEqual({ uri: "file:///" + file.sha256 + ".mp3" });
  expect(resolvedBeforeRead).toBe(false);
  expect(reads).toBe(1);
});

it("plays verified offline audio without waiting for the startup checkpoint", async () => {
  const { manager, port } = setup(completedSnapshot());
  let save!: () => void;
  port.write = vi.fn(
    () =>
      new Promise<void>((resolve) => {
        save = resolve;
      }),
  );
  const initializing = manager.initialize();
  let resolved: unknown;
  const playback = manager
    .resolveSource({ uri: "https://example.test" + file.path })
    .then((source) => {
      resolved = source;
    });
  await vi.waitFor(() => expect(port.write).toHaveBeenCalledOnce());
  expect(manager.getSnapshot().ready).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const sourceBeforeCheckpoint = resolved;
  save();
  await Promise.all([initializing, playback]);
  expect(sourceBeforeCheckpoint).toEqual({
    uri: "file:///" + file.sha256 + ".mp3",
  });
});

it("does not rewrite unchanged completed chapters when restarting a full offline library", async () => {
  const saved = completedSnapshot();
  const { manager, port } = setup(saved);
  await manager.initialize();
  expect(manager.getSnapshot().chapters[chapter.key]).toEqual(
    saved.chapters[chapter.key],
  );
  expect(port.write).toHaveBeenCalledWith(expect.anything(), {
    chapters: [],
    assets: [],
  });
});

it.each(["prepare", "enqueue", "pause", "resume", "remove", "flush"] as const)(
  "waits for startup before %s can change saved downloads",
  async (action) => {
    const saved = completedSnapshot();
    const { manager, port } = setup(saved);
    let release!: (value: OfflineSnapshot) => void;
    port.read = () =>
      new Promise<OfflineSnapshot>((resolve) => {
        release = resolve;
      });
    const loading = manager.initialize();
    let finished = false;
    const operation = (
      action === "prepare"
        ? manager.prepare([chapter])
        : action === "enqueue"
          ? manager.enqueue(
              createDownloadPlan([chapter], saved.assets, null),
              true,
            )
          : action === "flush"
            ? manager.flush()
            : manager[action]([chapter.key])
    ).then(() => {
      finished = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const wroteBeforeRead = vi.mocked(port.write).mock.calls.length;
    const finishedBeforeRead = finished;
    release(saved);
    await loading;
    await operation;
    expect(finishedBeforeRead).toBe(false);
    expect(wroteBeforeRead).toBe(0);
    expect(manager.getSnapshot().chapters[chapter.key]?.status).toBe(
      action === "remove" ? undefined : "complete",
    );
  },
);

it("does not overwrite saved downloads on startup failure and allows a retry", async () => {
  const saved = completedSnapshot();
  const { manager, port } = setup(saved);
  port.read = vi.fn(async () => {
    throw new Error("storage unavailable");
  });
  await expect(manager.remove([chapter.key])).rejects.toThrow(
    "storage unavailable",
  );
  expect(port.write).not.toHaveBeenCalled();
  expect(manager.getSnapshot().ready).toBe(false);
  port.read = async () => saved;
  await manager.initialize();
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
});

it("keeps bundled audio available while offline records are loading", async () => {
  const { manager, port } = setup();
  port.read = vi.fn(async () => null);
  expect(await manager.resolveSource(42)).toBe(42);
  expect(port.read).not.toHaveBeenCalled();
});

it.each([
  "file:///documents/my-song.mp3",
  "content://media/audio/42",
  "blob:https://example.test/my-song",
])("plays imported audio without waiting for downloads (%s)", async (uri) => {
  const { manager, port } = setup();
  port.read = vi.fn(async () => {
    throw new Error("offline metadata unavailable");
  });
  await expect(manager.resolveSource({ uri })).resolves.toEqual({ uri });
  expect(port.read).not.toHaveBeenCalled();
});

it("allows online playback when offline metadata cannot be read", async () => {
  const { manager, port } = setup();
  port.read = async () => {
    throw new Error("offline metadata unavailable");
  };
  const source = { uri: "https://example.test" + file.path };
  await expect(manager.resolveSource(source)).resolves.toEqual(source);
  expect(manager.getSnapshot().ready).toBe(false);
  expect(port.write).not.toHaveBeenCalled();
});

it("keeps initialization retryable when saving the restored index fails", async () => {
  const { manager, port } = setup(completedSnapshot());
  vi.mocked(port.write).mockRejectedValueOnce(new Error("disk unavailable"));
  await expect(manager.initialize()).rejects.toThrow("disk unavailable");
  expect(manager.getSnapshot().ready).toBe(false);
  await manager.initialize();
  expect(manager.getSnapshot().ready).toBe(true);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
});

it("yields between startup file-check batches so the home screen can respond", async () => {
  const saved = completedSnapshot();
  for (let i = 0; i < 32; i++)
    saved.assets[`extra-${i}`] = {
      ...file,
      path: `extra-${i}`,
      uri: "offline:a",
    };
  const { manager, port } = setup(saved);
  let responsive = false;
  let responsiveAtLastCheck = false;
  let checked = 0;
  port.exists = async () => {
    if (++checked === Object.keys(saved.assets).length)
      responsiveAtLastCheck = responsive;
    return true;
  };
  setTimeout(() => {
    responsive = true;
  }, 0);
  await manager.initialize();
  expect(responsiveAtLastCheck).toBe(true);
});

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

it("serializes resume behind deletion while an aborted transfer is settling", async () => {
  const { manager, port } = setup();
  let aborted = false,
    release!: () => void;
  const settling = new Promise<void>((resolve) => {
    release = resolve;
  });
  port.download = vi.fn(async (asset, signal) => {
    await new Promise<void>((_resolve, reject) => {
      signal.addEventListener(
        "abort",
        () => {
          aborted = true;
          void settling.then(() => reject(new Error("paused")));
        },
        { once: true },
      );
    });
    return { ...asset, uri: asset.path };
  });
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(
    createDownloadPlan([{ ...chapter, files: [file] }], {}, null),
    true,
  );
  await vi.waitFor(() => expect(port.download).toHaveBeenCalledOnce());
  const removing = manager.remove([chapter.key]);
  await vi.waitFor(() => expect(aborted).toBe(true));
  const resuming = manager.resume([chapter.key]);
  release();
  await removing;
  await resuming;
  const downloads = vi.mocked(port.download).mock.calls.length;
  await manager.pause([chapter.key]);
  expect(downloads).toBe(1);
  expect(manager.getSnapshot().chapters[chapter.key]).toBeUndefined();
  expect(manager.getSnapshot().assets).toEqual({});
});

it("recovers unindexed completed files before checking free space in enqueue", async () => {
  const { manager, port } = setup({
    chapters: { [chapter.key]: { ...chapter, status: "paused" } },
    assets: {},
    wifiOnly: true,
  });
  port.availableBytes = async () => 0;
  port.recover = vi.fn(async (asset) => ({ ...asset, uri: "local" }));
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([chapter], {}, null), true);
  expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete");
  expect(port.download).not.toHaveBeenCalled();
});

it("does not reserve twice for bytes already written by simultaneous downloads", async () => {
  const { manager, port } = setup();
  let free = 50;
  port.availableBytes = async () => free;
  const files = Array.from({ length: 5 }, (_, i) => ({
    path: `/file-${i}`,
    sha256: String(i),
    size: 10,
  }));
  const active = new Map<string, () => void>();
  port.download = vi.fn(async (asset, _signal, progress) => {
    await new Promise<void>((resolve) => {
      active.set(asset.path, resolve);
    });
    free -= asset.size;
    progress(asset.size);
    return { ...asset, uri: asset.path };
  });
  const five = { ...chapter, files };
  await manager.initialize();
  manager.setNetwork("wifi");
  await manager.enqueue(createDownloadPlan([five], {}, null), true);
  await vi.waitFor(() => expect(active.size).toBe(4));
  // Three other native partial files have already consumed nine bytes each.
  free -= 27;
  active.get(files[0].path)!();
  await vi.waitFor(() => expect(active.size).toBe(5));
  for (const finish of active.values()) finish();
  await vi.waitFor(() =>
    expect(manager.getSnapshot().chapters[chapter.key].status).toBe("complete"),
  );
});

it("serializes recovery preparation with removal so stale recovered files cannot reappear", async () => {
  const { manager, port } = setup({
    chapters: {
      [chapter.key]: { ...chapter, status: "paused", files: [file] },
    },
    assets: {},
    wifiOnly: true,
  });
  let release!: () => void;
  const recovering = new Promise<void>((resolve) => {
    release = resolve;
  });
  port.recover = vi.fn(async (asset) => {
    await recovering;
    return { ...asset, uri: "local" };
  });
  await manager.initialize();
  const preparing = manager.prepare([chapter]);
  await vi.waitFor(() => expect(port.recover).toHaveBeenCalled());
  port.remove = vi.fn(async () => {});
  const removing = manager.remove([chapter.key]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  const earlyRemovals = vi.mocked(port.remove).mock.calls.length;
  release();
  await preparing;
  await removing;
  expect(earlyRemovals).toBe(0);
  expect(manager.getSnapshot().assets).toEqual({});
  expect(manager.getSnapshot().chapters).toEqual({});
});
