import { createHash } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import type { DailyVerseImage } from "@selah/content/daily-verses";

const native = vi.hoisted(() => ({
  files: new Map<string, Uint8Array>(),
  resourceUri: "drawable_daily_photo",
  resourceBytes: new Uint8Array([255, 216, 1, 2, 3, 255, 217]),
  extractedUri: "file:///cache/ExponentAsset-photo.jpg",
  extractions: [] as string[],
  bundled: {} as Record<string, number>,
  failDocumentWrites: false,
}));

vi.mock("expo-asset", () => ({
  Asset: class Asset {
    name = "daily-photo";
    type = "jpg";
    hash = "metro-md5";
    uri: string;
    localUri: string | null = null;
    downloaded = false;
    constructor(source: { uri: string }) {
      this.uri = source.uri;
    }
    static fromModule() {
      const asset = new Asset({ uri: native.resourceUri });
      // Expo preserves Android drawable identifiers for Image compatibility.
      asset.localUri = native.resourceUri;
      asset.downloaded = true;
      return asset;
    }
    async downloadAsync() {
      if (!this.downloaded) {
        native.extractions.push(this.uri);
        native.files.set(native.extractedUri, native.resourceBytes);
        this.localUri = native.extractedUri;
        this.downloaded = true;
      }
      return this;
    }
  },
}));
vi.mock("expo-file-system", () => {
  const path = (parts: (string | { uri: string })[]) =>
    parts
      .map((p, i) => {
        const uri = typeof p === "string" ? p : p.uri;
        return i === 0 ? uri.replace(/\/$/, "") : uri.replace(/^\//, "");
      })
      .join("/");
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = path(parts);
      if (
        !this.uri.startsWith("file://") ||
        this.uri.startsWith("file:///android_res/")
      )
        throw new Error("Not a filesystem file: " + this.uri);
    }
    get exists() {
      return native.files.has(this.uri);
    }
    async bytes() {
      const bytes = native.files.get(this.uri);
      if (!bytes) throw new Error("File missing");
      return bytes;
    }
    async write(bytes: Uint8Array) {
      if (
        native.failDocumentWrites &&
        this.uri.startsWith("file:///documents/")
      )
        throw new Error("No space available");
      native.files.set(this.uri, bytes);
    }
    async move(destination: File) {
      native.files.set(destination.uri, await this.bytes());
      native.files.delete(this.uri);
      this.uri = destination.uri;
    }
    async delete() {
      native.files.delete(this.uri);
    }
  }
  return {
    File,
    Directory: class Directory {
      uri: string;
      constructor(...parts: (string | { uri: string })[]) {
        this.uri = path(parts);
      }
      async create() {}
    },
    Paths: { document: { uri: "file:///documents" } },
  };
});
vi.mock("expo-crypto", async () => {
  const { createHash } = await import("node:crypto");
  return {
    CryptoDigestAlgorithm: { SHA256: "SHA-256" },
    digest: async (_algorithm: string, bytes: Uint8Array) =>
      new Uint8Array(createHash("sha256").update(bytes).digest()).buffer,
  };
});
vi.mock("../src/data/daily-verse-images", () => ({
  bundledDailyVerseImages: native.bundled,
}));
vi.mock("../src/config/resources", () => ({
  resourceUrl: (path: string) => "https://example.org" + path,
}));
const bytes = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);
const hash = createHash("sha256").update(bytes).digest("hex");
const image: DailyVerseImage = {
  id: hash,
  sha256: hash,
  file: hash + ".jpg",
  author: "Photographer",
  sourceUrl: "https://example.org/photo",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  width: 1200,
  height: 800,
  theme: "hope",
};

beforeEach(() => {
  native.files.clear();
  native.extractions = [];
  native.resourceBytes = bytes;
  native.resourceUri = "drawable_daily_photo";
  native.failDocumentWrites = false;
  native.bundled[hash] = 42;
});
it.each(["drawable_daily_photo", "file:///android_res/drawable/photo.jpg"])(
  "extracts the Android packaged image %s to a verified persistent file without network",
  async (resource) => {
    native.resourceUri = resource;
    const { bundledDailyVerseImage, readDailyVerseImage } =
      await import("../src/data/daily-verse-storage");
    const uri = await bundledDailyVerseImage(image);
    expect(uri).toBe(`file:///documents/selah-daily-verses/${image.file}`);
    expect(native.files.get(uri!)).toEqual(bytes);
    expect(await readDailyVerseImage(image)).toBe(uri);
  },
);
it("uses an already extracted image file on iOS without another resource extraction", async () => {
  native.resourceUri = "file:///bundle/photo.jpg";
  native.files.set(native.resourceUri, bytes);
  const { bundledDailyVerseImage } =
    await import("../src/data/daily-verse-storage");
  expect(await bundledDailyVerseImage(image)).toMatch(
    /^file:\/\/\/documents\//,
  );
  expect(native.extractions).toEqual([]);
});
it("rejects corrupted embedded bytes before persisting them", async () => {
  native.resourceBytes = new Uint8Array([255, 216, 99, 255, 217]);
  const { bundledDailyVerseImage } =
    await import("../src/data/daily-verse-storage");
  await expect(bundledDailyVerseImage(image)).rejects.toThrow("integrity");
  expect(
    native.files.has(`file:///documents/selah-daily-verses/${image.file}`),
  ).toBe(false);
});
it("keeps a network image readable after the temporary File is moved", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes)),
  );
  try {
    const { downloadDailyVerseImage, readDailyVerseImage } =
      await import("../src/data/daily-verse-storage");
    const uri = await downloadDailyVerseImage(
      image,
      new AbortController().signal,
    );
    expect(native.files.get(uri)).toEqual(bytes);
    expect(await readDailyVerseImage(image)).toBe(uri);
    expect(
      [...native.files.keys()].some((path) => path.endsWith(".part")),
    ).toBe(false);
  } finally {
    vi.unstubAllGlobals();
  }
});
it("keeps the verified extracted photo available when document storage is full", async () => {
  native.failDocumentWrites = true;
  const { bundledDailyVerseImage } =
    await import("../src/data/daily-verse-storage");
  expect(await bundledDailyVerseImage(image)).toBe(native.extractedUri);
  expect(native.files.get(native.extractedUri)).toEqual(bytes);
});
it("removes only a damaged daily image before recovering its bundled original", async () => {
  const uri = `file:///documents/selah-daily-verses/${image.file}`;
  native.files.set(uri, new Uint8Array([255, 216, 99, 255, 217]));
  native.files.set(
    "file:///documents/learning-data.json",
    new Uint8Array([1, 2, 3]),
  );
  const { readDailyVerseImage, bundledDailyVerseImage } =
    await import("../src/data/daily-verse-storage");
  expect(await readDailyVerseImage(image)).toBeNull();
  expect(native.files.has(uri)).toBe(false);
  expect(await bundledDailyVerseImage(image)).toBe(uri);
  expect(native.files.get(uri)).toEqual(bytes);
  expect(native.files.get("file:///documents/learning-data.json")).toEqual(
    new Uint8Array([1, 2, 3]),
  );
});
