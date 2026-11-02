import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { DailyVerseImage } from "@selah/content/daily-verses";

const state = vi.hoisted(() => ({ assetUri: "http://localhost/bundled.jpg", bundled: {} as Record<string, number> }));
vi.mock("expo-asset", () => ({ Asset: { fromModule: () => ({ uri: state.assetUri }) } }));
vi.mock("../src/data/daily-verse-images", () => ({ bundledDailyVerseImages: state.bundled }));
vi.mock("../src/config/resources", () => ({ resourceUrl: (path: string) => `http://localhost:8890${path}` }));
const bytes = new Uint8Array([255, 216, 1, 2, 3, 255, 217]);
const hash = createHash("sha256").update(bytes).digest("hex");
const image: DailyVerseImage = { id: hash, sha256: hash, file: `${hash}.jpg`, author: "Photographer", sourceUrl: "https://example.org/photo", license: "CC0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", width: 1200, height: 800, theme: "water" };
let cached: Map<string, Response>;
beforeEach(() => {
  vi.resetModules();
  cached = new Map();
  vi.stubGlobal("location", new URL("http://localhost"));
  vi.stubGlobal("crypto", webcrypto);
  vi.stubGlobal("caches", { open: vi.fn(async () => ({
    match: async (key: string) => cached.get(key)?.clone(),
    put: async (key: string, response: Response) => { cached.set(key, response); },
    delete: async (key: string) => cached.delete(key),
  })) });
  vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
});
afterEach(() => { vi.unstubAllGlobals(); });

it("stores verified image bytes and recovers them after a runtime restart without network", async () => {
  const storage = await import("../src/data/daily-verse-storage.web");
  expect(await storage.readDailyVerseImage(image)).toBeNull();
  const uri = await storage.downloadDailyVerseImage(image, new AbortController().signal);
  expect(uri).toMatch(/^blob:/);
  expect(cached.size).toBe(1);
  vi.resetModules();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
  const restarted = await import("../src/data/daily-verse-storage.web");
  const recovered = await restarted.readDailyVerseImage(image);
  expect(recovered).toMatch(/^blob:/);
  expect(new Uint8Array(await (await fetchBlob(recovered!)).arrayBuffer())).toEqual(bytes);
});
// Fetch blob URLs through Node's actual fetch, independently of the network mock.
async function fetchBlob(uri: string) {
  return await import("node:buffer").then(({ resolveObjectURL }) => {
    const blob = resolveObjectURL(uri);
    if (!blob) throw new Error("Missing cached blob");
    return blob;
  });
}
it("deletes damaged cached bytes and downloads a clean replacement", async () => {
  cached.set(`http://localhost/__selah_daily__/${image.file}`, new Response(new Uint8Array([255,216,99,255,217])));
  const storage = await import("../src/data/daily-verse-storage.web");
  expect(await storage.readDailyVerseImage(image)).toBeNull();
  expect(cached.size).toBe(0);
  await storage.downloadDailyVerseImage(image, new AbortController().signal);
  expect(await storage.readDailyVerseImage(image)).toMatch(/^blob:/);
});
it("rejects bad server bytes without caching or displaying them", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response("not the expected image")));
  const storage = await import("../src/data/daily-verse-storage.web");
  await expect(storage.downloadDailyVerseImage(image, new AbortController().signal)).rejects.toThrow("integrity");
  expect(cached.size).toBe(0);
});
it("keeps the downloaded image readable when browser storage is full", async () => {
  vi.stubGlobal("caches", { open: async () => { throw new Error("quota"); } });
  const storage = await import("../src/data/daily-verse-storage.web");
  const uri = await storage.downloadDailyVerseImage(image, new AbortController().signal);
  expect(new Uint8Array(await (await fetchBlob(uri)).arrayBuffer())).toEqual(bytes);
});
