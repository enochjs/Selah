import { expect, it, vi } from "vitest";
import {
  createPlaylistCatalog,
  parsePlaylistCatalog,
} from "../src/data/playlist-catalog";

const playlist = {
  id: "quiet",
  titleZh: "安静",
  titleEn: "Quiet",
  descriptionZh: "静心赞美",
  descriptionEn: "Quiet praise",
  cover: "morning",
  hymnIds: ["doxology", "amazing-grace"],
  enabled: true,
};

it("accepts published playlists in server song order and filters disabled collections", () => {
  expect(
    parsePlaylistCatalog({
      revision: 1,
      items: [playlist, { ...playlist, id: "draft", enabled: false }],
    }),
  ).toEqual([playlist]);
});

it("rejects malformed, duplicate and unsafe server playlist data", () => {
  for (const bad of [
    { items: [playlist] },
    { revision: -1, items: [] },
    { revision: 1, items: [playlist, playlist] },
    ...[
      { cover: "https://other.example/image" },
      { hymnIds: ["doxology", "doxology"] },
      { titleZh: " " },
      { enabled: "true" },
    ].map((row) => ({ revision: 1, items: [{ ...playlist, ...row }] })),
  ])
    expect(() => parsePlaylistCatalog(bad)).toThrow();
});

it("shows offline state, keeps last good data on failure and honors an empty successful catalog", async () => {
  const fetch = vi.fn().mockResolvedValue({ revision: 1, items: [playlist] });
  const catalog = createPlaylistCatalog(fetch);
  const listener = vi.fn();
  const unsubscribe = catalog.subscribe(listener);
  await Promise.all([catalog.refresh(), catalog.refresh()]);
  expect(fetch).toHaveBeenCalledOnce();
  expect(catalog.getSnapshot()).toEqual({ items: [playlist], status: "ready" });
  fetch.mockRejectedValueOnce(new Error("offline"));
  await catalog.refresh();
  expect(catalog.getSnapshot()).toEqual({
    items: [playlist],
    status: "offline",
  });
  fetch.mockResolvedValueOnce({ revision: 2, items: [] });
  await catalog.refresh();
  expect(catalog.getSnapshot()).toEqual({ items: [], status: "ready" });
  expect(listener).toHaveBeenCalled();
  unsubscribe();
});
