import { beforeEach, expect, it, vi } from "vitest";
import type {
  DownloadOptions,
  DownloadPauseState,
  DownloadProgressData,
  DownloadResumable,
  FileSystemDownloadResult,
  FileSystemNetworkTaskProgressCallback,
} from "expo-file-system/legacy";
import type { DownloadAsset } from "../src/domain/offline-audio";
import { createOfflinePort } from "../src/data/offline-storage";

type Transfer = Pick<
  DownloadResumable,
  "downloadAsync" | "resumeAsync" | "pauseAsync"
>;

const native = vi.hoisted(() => {
  const files = new Map<string, Uint8Array<ArrayBuffer>>();
  const directories = new Set<string>();
  class Directory {
    readonly uri: string;
    constructor(parent: Directory | string, name: string) {
      this.uri =
        (typeof parent === "string" ? parent : parent.uri) + name + "/";
    }
    create() {
      directories.add(this.uri);
    }
  }
  class File {
    uri: string;
    constructor(parent: Directory, name: string) {
      this.uri = parent.uri + name;
    }
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.byteLength ?? 0;
    }
    async bytes() {
      const value = files.get(this.uri);
      if (!value) throw new Error("File does not exist");
      return value.slice();
    }
    async text() {
      return new TextDecoder().decode(await this.bytes());
    }
    async write(value: string) {
      // SDK 58 writes finish asynchronously, including pause data and metadata.
      await new Promise((resolve) => setTimeout(resolve, 10));
      files.set(this.uri, new TextEncoder().encode(value));
    }
    delete() {
      if (!files.delete(this.uri)) throw new Error("File does not exist");
    }
    async move(destination: File, options?: { overwrite?: boolean }) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const value = files.get(this.uri);
      if (!value || (files.has(destination.uri) && !options?.overwrite))
        throw new Error("Cannot move file");
      files.set(destination.uri, value);
      files.delete(this.uri);
      this.uri = destination.uri;
    }
  }
  return {
    files,
    directories,
    Directory,
    File,
    createDownloadResumable:
      vi.fn<
        (
          uri: string,
          fileUri: string,
          options?: DownloadOptions,
          callback?: FileSystemNetworkTaskProgressCallback<DownloadProgressData>,
          resumeData?: string,
        ) => Transfer
      >(),
    metadata: new Map<string, string>(),
  };
});

vi.mock("expo-file-system", () => ({
  Directory: native.Directory,
  File: native.File,
  Paths: { document: "file:///documents/", availableDiskSpace: 4096 },
}));
vi.mock("expo-file-system/legacy", () => ({
  createDownloadResumable: native.createDownloadResumable,
}));
vi.mock("expo-crypto", () => ({
  CryptoDigestAlgorithm: { SHA256: "SHA-256" },
  digest: async (algorithm: string, bytes: Uint8Array<ArrayBuffer>) => {
    if (algorithm !== "SHA-256") throw new Error("Unexpected hash algorithm");
    return crypto.subtle.digest(algorithm, bytes);
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => native.metadata.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      native.metadata.set(key, value);
    },
    multiGet: async (keys: string[]) =>
      keys.map((key) => [key, native.metadata.get(key) ?? null]),
    multiSet: async (entries: [string, string][]) => {
      for (const [key, value] of entries) native.metadata.set(key, value);
    },
    multiRemove: async (keys: string[]) => {
      for (const key of keys) native.metadata.delete(key);
    },
  },
}));
vi.mock("../src/config/resources", () => ({
  resourceUrl: (path: string) => "https://audio.example.test" + path,
}));

const content = new TextEncoder().encode("verified MP3 bytes");
const asset: DownloadAsset = {
  path: "/api/audio/resources/",
  size: content.byteLength,
  sha256: "06c8cfa9a576bb6bdebbd8ea4f59d831325f8354f3324a08303ca440975cea1f",
};
asset.path += asset.sha256 + ".mp3";
const directory = "file:///documents/selah-offline-audio/";
const uri = (suffix: string) => directory + asset.sha256 + suffix;

function completedTransfer(bytes = content, status = 200) {
  const transfer = {
    downloadAsync: vi.fn<Transfer["downloadAsync"]>(),
    resumeAsync: vi.fn<Transfer["resumeAsync"]>(),
    pauseAsync: vi.fn<Transfer["pauseAsync"]>(),
  };
  native.createDownloadResumable.mockImplementation(
    (_url, fileUri, _options, callback) => {
      const finish = async (): Promise<FileSystemDownloadResult> => {
        if (!native.directories.has(directory))
          throw new Error("Download directory does not exist");
        native.files.set(fileUri, bytes.slice());
        callback?.({
          totalBytesWritten: bytes.byteLength,
          totalBytesExpectedToWrite: bytes.byteLength,
        });
        return { uri: fileUri, status, headers: {}, mimeType: "audio/mpeg" };
      };
      transfer.downloadAsync.mockImplementation(finish);
      transfer.resumeAsync.mockImplementation(finish);
      return transfer;
    },
  );
  return transfer;
}

beforeEach(() => {
  native.files.clear();
  native.directories.clear();
  native.metadata.clear();
  native.createDownloadResumable.mockReset();
});

it("verifies downloaded bytes before exposing the final local MP3", async () => {
  const transfer = completedTransfer();
  const port = createOfflinePort();
  const progress = vi.fn();
  const stored = await port.download(
    asset,
    new AbortController().signal,
    progress,
  );

  expect(native.createDownloadResumable).toHaveBeenCalledWith(
    "https://audio.example.test" + asset.path,
    uri(".part"),
    {},
    expect.any(Function),
    undefined,
  );
  expect(transfer.downloadAsync).toHaveBeenCalledOnce();
  expect(transfer.resumeAsync).not.toHaveBeenCalled();
  expect(progress).toHaveBeenLastCalledWith(asset.size);
  expect(native.files.get(uri(".mp3"))).toEqual(content);
  expect(native.files.has(uri(".part"))).toBe(false);
  expect(await port.exists(stored)).toBe(true);
  expect(await port.resolve(stored)).toBe(uri(".mp3"));
  expect(await port.availableBytes()).toBe(4096);
});

it("rejects a same-size SHA mismatch without exposing a usable local file", async () => {
  const corrupt = content.slice();
  corrupt[0] ^= 1;
  completedTransfer(corrupt);
  const port = createOfflinePort();

  await expect(
    port.download(asset, new AbortController().signal, vi.fn()),
  ).rejects.toMatchObject({ code: "integrity" });

  expect(native.files.has(uri(".mp3"))).toBe(false);
  expect(native.files.has(uri(".part"))).toBe(false);
  expect(await port.exists({ ...asset, uri: "offline:" + asset.sha256 })).toBe(
    false,
  );
});

it("saves pause data on abort and resumes the partial download in a new port", async () => {
  let finishDownload!: (result: FileSystemDownloadResult | undefined) => void;
  const interrupted = new Promise<FileSystemDownloadResult | undefined>(
    (resolve) => {
      finishDownload = resolve;
    },
  );
  const paused: DownloadPauseState = {
    url: "https://audio.example.test" + asset.path,
    fileUri: uri(".part"),
    options: {},
    resumeData: "native-opaque-resume-data",
  };
  const pauseAsync = vi.fn(async () => {
    finishDownload(undefined);
    return paused;
  });
  const downloadAsync = vi.fn(async () => {
    native.files.set(uri(".part"), content.slice(0, 4));
    return interrupted;
  });
  native.createDownloadResumable.mockReturnValueOnce({
    downloadAsync,
    resumeAsync: vi.fn(),
    pauseAsync,
  });
  const controller = new AbortController();
  const pending = createOfflinePort().download(
    asset,
    controller.signal,
    vi.fn(),
  );
  const rejected = expect(pending).rejects.toMatchObject({ code: "network" });
  expect(downloadAsync).toHaveBeenCalledOnce();
  controller.abort();
  await rejected;

  expect(pauseAsync).toHaveBeenCalledOnce();
  expect(new TextDecoder().decode(native.files.get(uri(".resume")))).toBe(
    paused.resumeData,
  );
  expect(native.files.get(uri(".part"))).toEqual(content.slice(0, 4));
  expect(native.files.has(uri(".mp3"))).toBe(false);

  const resumed = completedTransfer(content, 206);
  const stored = await createOfflinePort().download(
    asset,
    new AbortController().signal,
    vi.fn(),
  );
  expect(native.createDownloadResumable).toHaveBeenLastCalledWith(
    paused.url,
    paused.fileUri,
    paused.options,
    expect.any(Function),
    paused.resumeData,
  );
  expect(resumed.resumeAsync).toHaveBeenCalledOnce();
  expect(resumed.downloadAsync).not.toHaveBeenCalled();
  expect(native.files.get(uri(".mp3"))).toEqual(content);
  expect(native.files.has(uri(".part"))).toBe(false);
  expect(native.files.has(uri(".resume"))).toBe(false);
  expect(await createOfflinePort().exists(stored)).toBe(true);
});

it("removes final, partial, and resume files while preserving other audio", async () => {
  for (const suffix of [".mp3", ".part", ".resume"])
    native.files.set(uri(suffix), content.slice());
  const other = directory + "b".repeat(64) + ".mp3";
  native.files.set(other, content.slice());
  const port = createOfflinePort();
  const stored = { ...asset, uri: "file:///unrelated/user-document.mp3" };
  await port.remove(stored);
  await port.remove(stored);

  expect([...native.files.keys()]).toEqual([other]);
  expect(await port.exists(stored)).toBe(false);
});

it("persists and replaces native download metadata outside the size-limited key-value database", async () => {
  const saved = { ...asset, uri: "offline:" + asset.sha256 };
  const snapshot = {
    chapters: {},
    assets: { [asset.path]: saved },
    wifiOnly: true,
  };
  const port = createOfflinePort();
  await port.write(snapshot);
  expect(native.metadata.size).toBe(0);
  expect(await createOfflinePort().read()).toEqual(snapshot);
  const updated = { ...snapshot, wifiOnly: false };
  await port.write(updated);
  expect(await createOfflinePort().read()).toEqual(updated);
  await port.write({ chapters: {}, assets: {}, wifiOnly: false });
  expect(await createOfflinePort().read()).toEqual({
    chapters: {},
    assets: {},
    wifiOnly: false,
  });
  expect([...native.files.keys()].some((path) => path.endsWith(".tmp"))).toBe(
    false,
  );
});
