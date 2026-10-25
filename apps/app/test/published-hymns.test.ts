import { expect, it, vi } from "vitest";
import { parseHymnCatalog, createHymnCatalog } from "../src/data/hymn-catalog";

const hymn = {
  id: "uploaded-song",
  titleZh: "新诗歌",
  titleEn: "New hymn",
  subtitleZh: "敬拜",
  subtitleEn: "Worship",
  duration: 45,
  audioPath: `/api/audio/hymns/${"a".repeat(64)}.mp3`,
  enabled: true,
  reviewStatus: "approved",
};
it("accepts published remote recordings and filters pending, rejected and disabled hymns", () => {
  const parsed = parseHymnCatalog({
    revision: 4,
    items: [
      hymn,
      { ...hymn, id: "pending", reviewStatus: "pending" },
      { ...hymn, id: "rejected", reviewStatus: "rejected" },
      { ...hymn, id: "disabled", enabled: false },
    ],
  });
  expect(parsed.map((row) => row.id)).toEqual(["uploaded-song"]);
});
it("rejects malformed responses and untrusted media addresses instead of replacing the catalog", () => {
  expect(() => parseHymnCatalog({ items: [hymn] })).toThrow();
  expect(() =>
    parseHymnCatalog({
      revision: 1,
      items: [{ ...hymn, audioPath: "https://other.example/song.mp3" }],
    }),
  ).toThrow();
  expect(() =>
    parseHymnCatalog({ revision: 1, items: [{ ...hymn, duration: -1 }] }),
  ).toThrow();
});
it("replaces the bundled list on refresh, applies an empty published list and retains the last good catalog offline", async () => {
  const fetchCatalog = vi
    .fn()
    .mockResolvedValue({ revision: 1, items: [hymn] });
  const store = createHymnCatalog([], fetchCatalog);
  const listener = vi.fn();
  const unsubscribe = store.subscribe(listener);
  expect(store.getSnapshot()).toEqual([]);
  await store.refresh();
  expect(store.getSnapshot()).toEqual([hymn]);
  expect(listener).toHaveBeenCalledOnce();
  fetchCatalog.mockRejectedValueOnce(new Error("offline"));
  await store.refresh();
  expect(store.getSnapshot()).toEqual([hymn]);
  fetchCatalog.mockResolvedValueOnce({ revision: 2, items: [] });
  await store.refresh();
  expect(store.getSnapshot()).toEqual([]);
  unsubscribe();
});
it("deduplicates simultaneous refreshes and keeps existing data on invalid responses", async () => {
  const fetchCatalog = vi
    .fn()
    .mockResolvedValue({ revision: 1, items: [{ ...hymn, audioPath: "bad" }] });
  const store = createHymnCatalog([hymn], fetchCatalog);
  await Promise.all([store.refresh(), store.refresh()]);
  expect(fetchCatalog).toHaveBeenCalledOnce();
  expect(store.getSnapshot()).toEqual([hymn]);
});
