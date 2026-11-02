import { expect, it, vi } from "vitest";
import type { DailyVerseCatalog } from "@selah/content/daily-verses";
import {
  createDailyVerseCatalog,
  type DailyVersePort,
} from "../src/data/daily-verse-catalog";

const hash = "a".repeat(64);
const initial: DailyVerseCatalog = {
  revision: 0,
  images: [
    {
      id: hash,
      sha256: hash,
      file: `${hash}.jpg`,
      author: "Author",
      sourceUrl: "https://example.org/photo",
      license: "CC0",
      licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
      width: 1200,
      height: 800,
      theme: "water",
    },
  ],
  items: [
    {
      id: "daily-2026-11-02",
      date: "2026-11-02",
      reference: { bookId: "psalms", chapter: 23, verse: 1 },
      imageId: hash,
      status: "approved",
      theme: "peace",
    },
  ],
};
function setup(overrides: Partial<DailyVersePort> = {}) {
  const port: DailyVersePort = {
    readCatalog: vi.fn(async () => null),
    writeCatalog: vi.fn(async () => {}),
    fetchCatalog: vi.fn(async () => initial),
    readImage: vi.fn(async () => null),
    bundledImage: vi.fn(async () => null),
    downloadImage: vi.fn(async () => "file:///daily.jpg"),
    validReference: () => true,
    ...overrides,
  };
  return { port, runtime: createDailyVerseCatalog(initial, port) };
}
it("uses bundled content immediately and preserves it through an offline refresh", async () => {
  const { runtime } = setup({
    fetchCatalog: async () => {
      throw new Error("offline");
    },
  });
  expect(runtime.getSnapshot().catalog).toEqual(initial);
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog).toEqual(initial);
  expect(runtime.getSnapshot().online).toBe(false);
  expect(runtime.getSnapshot().images[hash]).toBe("file:///daily.jpg");
});
it("recovers a persisted catalog on restart while rejecting a damaged cache", async () => {
  const saved = { ...initial, revision: 3 };
  const { runtime } = setup({
    readCatalog: async () => saved,
    fetchCatalog: async () => {
      throw new Error("offline");
    },
  });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog.revision).toBe(3);
  const broken = setup({
    readCatalog: async () => ({ revision: 5, items: "broken" }),
    fetchCatalog: async () => {
      throw new Error("offline");
    },
  });
  await broken.runtime.refresh("2026-11-02");
  expect(broken.runtime.getSnapshot().catalog).toEqual(initial);
});
it("treats a successful empty catalog as authoritative after withdrawal", async () => {
  const next = { revision: 2, items: [], images: [] };
  const { runtime, port } = setup({ fetchCatalog: async () => next });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog).toEqual(next);
  expect(port.writeCatalog).toHaveBeenCalledWith(next);
  expect(runtime.getSnapshot().images).toEqual({});
});
it("rejects missing scripture references and malformed remote records without poisoning cached content", async () => {
  const { runtime, port } = setup({
    validReference: (r) => r.bookId !== "missing",
    fetchCatalog: async () => ({
      ...initial,
      items: [
        {
          ...initial.items[0],
          reference: { bookId: "missing", chapter: 1, verse: 1 },
        },
      ],
    }),
  });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog).toEqual(initial);
  expect(port.writeCatalog).not.toHaveBeenCalled();
});
it("prefers verified existing images and avoids duplicate downloads across simultaneous refreshes", async () => {
  const { runtime, port } = setup({
    readImage: vi.fn(async () => "file:///cached.jpg"),
  });
  await Promise.all([
    runtime.refresh("2026-11-02"),
    runtime.refresh("2026-11-02"),
  ]);
  expect(port.fetchCatalog).toHaveBeenCalledTimes(1);
  expect(port.downloadImage).not.toHaveBeenCalled();
  expect(runtime.getSnapshot().images[hash]).toBe("file:///cached.jpg");
});
it("redownloads missing or corrupted image bytes and retries a failed download", async () => {
  const downloadImage = vi
    .fn()
    .mockRejectedValueOnce(new Error("network"))
    .mockResolvedValue("file:///recovered.jpg");
  const { runtime } = setup({ downloadImage });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().images[hash]).toBeUndefined();
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().images[hash]).toBe("file:///recovered.jpg");
});
it("continues to the network image when the packaged image cannot be read", async () => {
  const { runtime, port } = setup({
    bundledImage: async () => {
      throw new Error("Android drawable is not a file");
    },
  });
  await runtime.refresh("2026-11-02");
  expect(port.downloadImage).toHaveBeenCalledTimes(1);
  expect(runtime.getSnapshot().images[hash]).toBe("file:///daily.jpg");
});
it("still displays the bundled image if document storage cannot be opened", async () => {
  const { runtime, port } = setup({
    readImage: async () => {
      throw new Error("Storage unavailable");
    },
    bundledImage: async () => "file:///bundle/photo.jpg",
  });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().images[hash]).toBe("file:///bundle/photo.jpg");
  expect(port.downloadImage).not.toHaveBeenCalled();
});
it("still updates in memory if local storage is full", async () => {
  const { runtime } = setup({
    fetchCatalog: async () => ({ ...initial, revision: 4 }),
    writeCatalog: async () => {
      throw new Error("quota");
    },
  });
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog.revision).toBe(4);
  expect(runtime.getSnapshot().online).toBe(true);
});

it("keeps a newer bundled schedule during an offline upgrade", async () => {
  const bundled = { ...initial, revision: 2 };
  const { port } = setup({
    readCatalog: async () => ({ revision: 1, images: [], items: [] }),
    fetchCatalog: async () => {
      throw new Error("offline");
    },
  });
  const runtime = createDailyVerseCatalog(bundled, port);
  await runtime.refresh("2026-11-02");
  expect(runtime.getSnapshot().catalog).toEqual(bundled);
});
it.each([2, 3])(
  "preserves an authoritative empty saved catalog at revision %s",
  async (revision) => {
    const saved = { revision, images: [], items: [] };
    const { port } = setup({
      readCatalog: async () => saved,
      fetchCatalog: async () => {
        throw new Error("offline");
      },
    });
    const runtime = createDailyVerseCatalog({ ...initial, revision: 2 }, port);
    await runtime.refresh("2026-11-02");
    expect(runtime.getSnapshot().catalog).toEqual(saved);
  },
);
