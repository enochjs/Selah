import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ saved: new Map<string, string>() }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.saved.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.saved.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.saved.delete(key);
    },
  },
}));
import { useAppStore } from "../src/state/app-store";

const song = { id: "amazing-grace", title: "奇异恩典" };
const second = { id: "doxology", title: "三一颂" };
beforeEach(() => {
  storage.saved.clear();
  useAppStore.setState(useAppStore.getInitialState(), true);
});

it("favorites a server hymn by reference and toggles it without duplicating or storing audio", () => {
  useAppStore.getState().toggleFavoriteHymn(song);
  expect(useAppStore.getState().favoriteHymns).toEqual([song]);
  useAppStore.getState().toggleFavoriteHymn({ ...song, title: "Updated" });
  expect(useAppStore.getState().favoriteHymns).toEqual([]);
});

it("creates, renames and deletes personal playlists without changing favorites or other playlists", () => {
  const store = useAppStore.getState();
  expect(store.createMusicPlaylist("   ")).toBeNull();
  expect(store.createMusicPlaylist("a".repeat(61))).toBeNull();
  const id = store.createMusicPlaylist("  晨间赞美  ")!;
  const other = store.createMusicPlaylist("夜间")!;
  expect(id).not.toBe(other);
  store.toggleFavoriteHymn(song);
  store.addPlaylistHymn(id, song);
  store.addPlaylistHymn(id, song);
  store.addPlaylistHymn(other, song);
  expect(useAppStore.getState().musicPlaylists[0]).toMatchObject({
    id,
    name: "晨间赞美",
    hymns: [song],
  });
  expect(store.renameMusicPlaylist(id, " ")).toBe(false);
  expect(store.renameMusicPlaylist(id, "静心")).toBe(true);
  expect(useAppStore.getState().musicPlaylists[0].name).toBe("静心");
  store.deleteMusicPlaylist(id);
  expect(useAppStore.getState().musicPlaylists.map((p) => p.id)).toEqual([
    other,
  ]);
  expect(useAppStore.getState().favoriteHymns).toEqual([song]);
});

it("reorders and removes songs only inside the target playlist, including unavailable references", () => {
  const store = useAppStore.getState();
  const id = store.createMusicPlaylist("Test")!;
  store.addPlaylistHymn(id, song);
  store.addPlaylistHymn(id, second);
  store.movePlaylistHymn(id, second.id, -1);
  expect(useAppStore.getState().musicPlaylists[0].hymns).toEqual([
    second,
    song,
  ]);
  store.movePlaylistHymn(id, second.id, -1);
  store.movePlaylistHymn(id, "missing", 1);
  expect(useAppStore.getState().musicPlaylists[0].hymns).toEqual([
    second,
    song,
  ]);
  store.removePlaylistHymn(id, song.id);
  expect(useAppStore.getState().musicPlaylists[0].hymns).toEqual([second]);
});

it("persists the music library across hydration without changing existing local music or study data", async () => {
  const store = useAppStore.getState();
  store.addSong({
    id: "old",
    title: "旧录音",
    uri: "library:old",
    addedAt: "2026-10-25",
  });
  store.toggleBookmark("john:3:16");
  const id = store.createMusicPlaylist("Praise")!;
  store.toggleFavoriteHymn(song);
  store.addPlaylistHymn(id, second);
  const serialized = storage.saved.get("selah-library-v1")!;
  useAppStore.setState(useAppStore.getInitialState(), true);
  storage.saved.set("selah-library-v1", serialized);
  await useAppStore.persist.rehydrate();
  expect(useAppStore.getState().favoriteHymns).toEqual([song]);
  expect(useAppStore.getState().musicPlaylists[0]).toMatchObject({
    id,
    hymns: [second],
  });
  expect(useAppStore.getState().songs[0].uri).toBe("library:old");
  expect(useAppStore.getState().bookmarks).toEqual(["john:3:16"]);
});

it("merges legacy version-one data with empty new collections and retains saved unavailable songs", () => {
  const merge = useAppStore.persist.getOptions().merge!;
  const legacy = {
    songs: [{ id: "old", uri: "library:old" }],
    words: [],
    bookmarks: ["john:3:16"],
  };
  const next = merge(legacy, useAppStore.getInitialState());
  expect(next.favoriteHymns).toEqual([]);
  expect(next.musicPlaylists).toEqual([]);
  expect(next.songs).toEqual(legacy.songs);
  const restored = merge(
    {
      favoriteHymns: [song, song],
      musicPlaylists: [{ id: "p", name: "P", hymns: [second] }],
    },
    next,
  );
  expect(restored.favoriteHymns).toEqual([song]);
  expect(restored.musicPlaylists[0].hymns).toEqual([second]);
});
