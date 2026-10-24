import { afterEach, expect, it, vi } from "vitest";
import { createOfflinePort } from "../src/data/offline-storage.web";

vi.mock("../src/config/resources", () => ({
  resourceUrl: (path: string) => "https://audio.example.test" + path,
}));
vi.mock("../src/data/offline-metadata", () => ({
  offlineMetadata: () => ({ read: async () => null, write: async () => {} }),
}));
afterEach(() => vi.unstubAllGlobals());

it("classifies failed browser transport as a network interruption", async () => {
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
