import { afterEach, expect, it, vi } from "vitest";
import { createOfflinePort } from "../src/data/offline-storage.web";

vi.mock("../src/config/resources", () => ({
  resourceUrl: (path: string) => "https://audio.example.test" + path,
}));
vi.mock("../src/data/offline-metadata", () => ({
  offlineMetadata: () => ({ read: async () => null, write: async () => {} }),
}));
afterEach(() => vi.unstubAllGlobals());
function emptyCache() {
  vi.stubGlobal("location", { origin: "http://localhost" });
  vi.stubGlobal("caches", {
    open: async () => ({ match: async () => undefined }),
  });
}

it("classifies failed browser transport as a network interruption", async () => {
  emptyCache();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockRejectedValue(new TypeError("Failed to fetch")),
  );
  await expect(
    createOfflinePort().download(
      { path: "/audio.mp3", sha256: "a".repeat(64), size: 3 },
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ code: "network" });
});

it("reports browser cache quota exhaustion as storage failure after verifying bytes", async () => {
  const content = new TextEncoder().encode("mp3");
  const sha256 = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", content)),
  ]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  vi.stubGlobal("location", { origin: "http://localhost" });
  vi.stubGlobal("fetch", async () => new Response(content));
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async () => undefined,
      put: async () => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      },
    }),
  });
  await expect(
    createOfflinePort().download(
      { path: "/audio.mp3", sha256, size: content.length },
      new AbortController().signal,
      () => {},
    ),
  ).rejects.toMatchObject({ code: "storage" });
});

it.each([false, true])(
  "recovers completed cached bytes and replaces corruption (%s)",
  async (corrupt) => {
    const bytes = new TextEncoder().encode("mp3");
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const fetcher = vi.fn(async () => new Response(bytes));
    const remove = vi.fn(async () => true);
    const put = vi.fn(async () => {});
    vi.stubGlobal("location", { origin: "http://localhost" });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("caches", {
      open: async () => ({
        match: async () => new Response(corrupt ? "bad" : bytes),
        delete: remove,
        put,
      }),
    });
    const result = await createOfflinePort().download(
      { path: "/audio.mp3", sha256, size: 3 },
      new AbortController().signal,
      () => {},
    );
    expect(result.uri).toBe("offline:" + sha256);
    expect(fetcher).toHaveBeenCalledTimes(corrupt ? 1 : 0);
    expect(remove).toHaveBeenCalledTimes(corrupt ? 1 : 0);
  },
);

it.each(["valid", "corrupt", "missing", "cancelled"])(
  "recovers browser completed files without network (%s)",
  async (state) => {
    const bytes = new TextEncoder().encode("mp3");
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const remove = vi.fn(async () => true);
    const fetcher = vi.fn();
    vi.stubGlobal("location", { origin: "http://localhost" });
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("caches", {
      open: async () => ({
        match: async () =>
          state === "missing"
            ? undefined
            : new Response(state === "corrupt" ? "bad" : bytes),
        delete: remove,
      }),
    });
    const controller = new AbortController();
    if (state === "cancelled") controller.abort();
    const recovery = createOfflinePort().recover!(
      { path: "/audio.mp3", sha256, size: 3 },
      controller.signal,
    );
    if (state === "cancelled")
      await expect(recovery).rejects.toMatchObject({ code: "network" });
    else if (state === "valid")
      await expect(recovery).resolves.toMatchObject({
        uri: "offline:" + sha256,
      });
    else await expect(recovery).resolves.toBeNull();
    expect(remove).toHaveBeenCalledTimes(state === "corrupt" ? 1 : 0);
    expect(fetcher).not.toHaveBeenCalled();
  },
);

it("honors cancellation while looking up a missing browser cache entry", async () => {
  const controller = new AbortController();
  vi.stubGlobal("location", { origin: "http://localhost" });
  vi.stubGlobal("caches", {
    open: async () => ({
      match: async () => {
        controller.abort();
        return undefined;
      },
    }),
  });
  await expect(
    createOfflinePort().recover!(
      { path: "/audio.mp3", sha256: "a".repeat(64), size: 3 },
      controller.signal,
    ),
  ).rejects.toMatchObject({ code: "network" });
});

it("keeps completed cache playable while required updates block fresh network transfers", async () => {
  const { bindUpdateCompatibility } =
    await import("../src/data/update-compatibility");
  const release = { buildNumber: 5, minSupportedBuild: 3 };
  const dispose = bindUpdateCompatibility({
    getSnapshot: () => ({ installed: { buildNumber: 2 }, release }),
    subscribe: () => () => {},
    initialize: async () => {},
  });
  try {
    const bytes = new TextEncoder().encode("cached MP3");
    const sha256 = [
      ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    ]
      .map((value) => value.toString(16).padStart(2, "0"))
      .join("");
    const asset = { path: "/audio.mp3", size: bytes.length, sha256 };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    vi.stubGlobal("location", { origin: "http://localhost" });
    vi.stubGlobal("caches", {
      open: async () => ({
        match: async () =>
          new Response(bytes, {
            headers: { "Content-Length": String(bytes.length) },
          }),
      }),
    });
    const port = createOfflinePort();
    const stored = await port.download(
      asset,
      new AbortController().signal,
      () => {},
    );
    expect(stored.sha256).toBe(sha256);
    expect(await port.resolve(stored)).toMatch(/^blob:/);
    emptyCache();
    await expect(
      port.download(asset, new AbortController().signal, () => {}),
    ).rejects.toMatchObject({ code: "update-required" });
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    dispose();
  }
});
