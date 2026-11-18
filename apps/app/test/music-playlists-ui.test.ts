import React from "react";
import { beforeEach, expect, it } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { ChevronLeft } from "lucide-react-native";
import { useAppStore } from "../src/state/app-store";
import { HymnSearchScreen } from "../src/features/audio/HymnSearchScreen";
import { MusicCollectionScreen } from "../src/features/audio/MusicCollectionScreen";
import { PlatformPlaylistsScreen } from "../src/features/audio/PlatformPlaylistsScreen";
import { MusicScreen } from "../src/features/audio/MusicScreen";

beforeEach(() => {
  resetUI();
  useAppStore.setState(useAppStore.getInitialState(), true);
  ui.hymns = [
    {
      id: "grace",
      title: "奇异恩典",
      subtitle: "钢琴",
      kind: "hymn",
      source: 1,
      artwork: 1,
      duration: 265,
    },
    {
      id: "praise",
      title: "赞美",
      subtitle: "钢琴",
      kind: "hymn",
      source: 2,
      artwork: 1,
    },
  ];
  ui.playlists = [
    {
      id: "morning",
      titleZh: "清晨歌单",
      titleEn: "Morning",
      descriptionZh: "晨间赞美",
      descriptionEn: "Morning praise",
      cover: "morning",
      hymnIds: ["praise", "grace"],
      enabled: true,
    },
  ];
});
const render = () => draw(React.createElement(MusicScreen));
it("exposes search, favorites and recent listening before the song library", () => {
  const html = render();
  expect(html.indexOf("搜歌名、演唱者或一句歌词")).toBeGreaterThan(-1);
  expect(html.indexOf("我的收藏")).toBeLessThan(html.indexOf("全部歌曲"));
  expect(html.indexOf("最近播放")).toBeLessThan(html.indexOf("全部歌曲"));
  expect(html).not.toContain("奇异恩典");
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("opens a personal playlist as its own screen without starting playback", () => {
  const id = useAppStore.getState().createMusicPlaylist("清晨赞美")!;
  render();
  press("打开歌单 清晨赞美");
  expect(ui.push).toHaveBeenCalledWith({
    pathname: "/music/collection",
    params: { kind: "personal", id },
  });
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("keeps playback in the search screen and shows the actual matching lyric", () => {
  ui.hymns[0].lyrics = "[00:04.20]恩典永远不离开";
  const search = () => draw(React.createElement(HymnSearchScreen, {}));
  search();
  ui.inputs[0].onChangeText("永远不离开");
  expect(search()).toContain("恩典永远不离开");
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[0]]);
  expect(ui.back).not.toHaveBeenCalled();
  expect(search()).toContain("恩典永远不离开");
});

it("batch-selects recordings across search queries and skips an already added recording", () => {
  const store = useAppStore.getState();
  const id = store.createMusicPlaylist("我的歌单")!;
  store.addPlaylistHymn(id, ui.hymns[0]);
  ui.hymns.push({ ...ui.hymns[1], id: "hope", title: "盼望" });
  const search = () =>
    draw(React.createElement(HymnSearchScreen, { playlistId: id }));
  expect(search()).toContain("已添加");
  expect(ui.actions.find(({ label }) => label === "奇异恩典")?.disabled).toBe(
    true,
  );
  press("赞美");
  search();
  ui.inputs[0].onChangeText("盼望");
  search();
  press("盼望");
  search();
  press("添加 2 首");
  expect(
    useAppStore.getState().musicPlaylists[0].hymns.map((hymn) => hymn.id),
  ).toEqual(["grace", "praise", "hope"]);
  expect(ui.back).toHaveBeenCalledOnce();
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("adds a song from search and can undo without replacing playback", () => {
  const id = useAppStore.getState().createMusicPlaylist("清晨赞美")!;
  const search = () => draw(React.createElement(HymnSearchScreen, {}));
  search();
  ui.inputs[0].onChangeText("恩典");
  search();
  press("更多操作 奇异恩典");
  search();
  press("添加到歌单");
  search();
  ui.dialogs.find((dialog) => dialog.title === "奇异恩典")?.onDismiss?.();
  search();
  press("加入 清晨赞美");
  expect(
    useAppStore.getState().musicPlaylists.find((p) => p.id === id)?.hymns,
  ).toEqual([{ id: "grace", title: "奇异恩典" }]);
  useAppStore.getState().toastAction?.run();
  expect(useAppStore.getState().musicPlaylists[0].hymns).toEqual([]);
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("retains unavailable favorites and skips them in playback", () => {
  const store = useAppStore.getState();
  store.toggleFavoriteHymn({ id: "gone", title: "旧诗歌" });
  store.toggleFavoriteHymn({ id: "grace", title: "旧名称" });
  const html = draw(
    React.createElement(MusicCollectionScreen, { kind: "favorites" }),
  );
  expect(html).toContain("旧诗歌");
  expect(html).toContain("暂不可用");
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[0]], 0);
  expect(useAppStore.getState().favoriteHymns).toHaveLength(2);
});

it("offers a bounded view of a large catalog and keeps the correct song order", () => {
  ui.hymns = Array.from({ length: 131 }, (_, index) => ({
    ...ui.hymns[0],
    id: `song-${index}`,
    title: `歌曲 ${index}`,
  }));
  ui.listStart = 120;
  draw(React.createElement(MusicCollectionScreen, { kind: "catalog" }));
  expect(ui.listSizes.at(-1)).toBe(131);
  expect(
    ui.actions.filter((action) => action.label.startsWith("更多操作 歌曲"))
      .length,
  ).toBeLessThanOrEqual(12);
  press("播放 歌曲 125");
  expect(ui.playQueue).toHaveBeenCalledWith(ui.hymns, 125);
});

it("opens a platform collection in curated order without playing it on entry", () => {
  draw(React.createElement(PlatformPlaylistsScreen));
  press("打开歌单 清晨歌单");
  expect(ui.push).toHaveBeenCalledWith({
    pathname: "/music/collection",
    params: { kind: "cloud", id: "morning" },
  });
  draw(
    React.createElement(MusicCollectionScreen, {
      kind: "cloud",
      id: "morning",
    }),
  );
  expect(ui.playQueue).not.toHaveBeenCalled();
  press("播放全部");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[1], ui.hymns[0]]);
});

it("contains all eight playlist images within their card frames", () => {
  const template = ui.playlists[0];
  ui.playlists = Array.from({ length: 8 }, (_, index) => ({
    ...template,
    id: `playlist-${index}`,
    titleZh: `歌单 ${index + 1}`,
    cover: (["morning", "lake", "mountains"] as const)[index % 3],
  }));
  draw(React.createElement(PlatformPlaylistsScreen));
  expect(ui.images).toHaveLength(8);
  for (const image of ui.images) {
    expect(image.resizeMode).toBe("cover");
    expect(image.style).toMatchObject({
      position: "absolute",
      width: "100%",
      height: "100%",
    });
  }
  press("打开歌单 歌单 8");
  expect(ui.push).toHaveBeenCalledWith({
    pathname: "/music/collection",
    params: { kind: "cloud", id: "playlist-7" },
  });
});

it("uses the same chevron and returns one screen at a time in the listening library", () => {
  const screens = [
    React.createElement(PlatformPlaylistsScreen),
    React.createElement(MusicCollectionScreen, {
      kind: "cloud",
      id: "morning",
    }),
    React.createElement(HymnSearchScreen),
  ];
  for (const screen of screens) {
    ui.cells = [];
    draw(screen);
    expect(ui.actions.find(({ label }) => label === "返回")?.icon).toBe(
      ChevronLeft,
    );
    press("返回");
  }
  expect(ui.back).toHaveBeenCalledTimes(screens.length);
  expect(ui.replace).not.toHaveBeenCalled();

  ui.canGoBack = false;
  draw(React.createElement(PlatformPlaylistsScreen));
  press("返回");
  expect(ui.replace).toHaveBeenCalledExactlyOnceWith("/music");
});

it("renames and deletes a playlist from Edit without removing saved songs", () => {
  const store = useAppStore.getState();
  const id = store.createMusicPlaylist("旧名称")!;
  store.addPlaylistHymn(id, ui.hymns[0]);
  store.toggleFavoriteHymn(ui.hymns[0]);
  const collection = () =>
    draw(React.createElement(MusicCollectionScreen, { kind: "personal", id }));
  collection();
  press("编辑");
  collection();
  press("重命名");
  collection();
  ui.inputs
    .find((item) => item.accessibilityLabel === "歌单名称")!
    .onChangeText("新名称");
  collection();
  press("保存名称");
  expect(collection()).toContain("新名称");
  press("删除歌单");
  collection();
  press("确认删除歌单");
  expect(useAppStore.getState().musicPlaylists).toEqual([]);
  expect(useAppStore.getState().favoriteHymns).toHaveLength(1);
  expect(ui.back).toHaveBeenCalledOnce();
});

it("can refresh both libraries from a cached home screen", async () => {
  ui.hymnStatus = "offline";
  expect(render()).toContain("已缓存的内容");
  await press("重试");
  expect(ui.refreshHymns).toHaveBeenCalledOnce();
  expect(ui.refreshPlaylists).toHaveBeenCalledOnce();
});

it("opens downloaded hymns from the listening home", () => {
  render();
  press("已下载");
  expect(ui.push).toHaveBeenCalledWith("/music/downloads");
});

it("pauses and resumes the active favorites queue without starting over", () => {
  const store = useAppStore.getState();
  for (const song of ui.hymns) store.toggleFavoriteHymn(song);
  ui.audioTrack = ui.hymns[1];
  ui.audioQueue = ui.hymns;
  const favorites = () =>
    draw(React.createElement(MusicCollectionScreen, { kind: "favorites" }));
  expect(favorites()).toContain("2 首");
  press("暂停歌单");
  expect(ui.toggle).toHaveBeenCalledOnce();
  ui.audioPlaying = false;
  favorites();
  press("继续播放歌单");
  expect(ui.toggle).toHaveBeenCalledTimes(2);
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("plays the whole collection when the same recording came from a different queue", () => {
  for (const song of ui.hymns) useAppStore.getState().toggleFavoriteHymn(song);
  ui.audioTrack = ui.hymns[1];
  ui.audioQueue = [ui.hymns[1]];
  draw(React.createElement(MusicCollectionScreen, { kind: "favorites" }));
  press("播放全部");
  expect(ui.playQueue).toHaveBeenCalledExactlyOnceWith(ui.hymns);
  expect(ui.toggle).not.toHaveBeenCalled();
});
