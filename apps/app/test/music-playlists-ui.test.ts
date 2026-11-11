import React from "react";
import { beforeEach, expect, it } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
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
const input = (value: string) =>
  ui.inputs
    .find((i) => i.accessibilityLabel === "歌单名称")!
    .onChangeText(value);

it("shows all playlists to a new listener and offers two stable tabs without a featured song", () => {
  const html = render();
  expect(html).toContain("全部歌单");
  expect(html).toContain("清晨歌单");
  expect(html).toContain("全部歌曲");
  expect(html).not.toContain("精选诗歌");
  expect(html).not.toContain("奇异恩典");
  expect(html).not.toMatch(/导入|上传|选择本地音频/);
  expect(ui.actions.some((a) => a.label === "新建歌单")).toBe(true);
});

it("selects a platform playlist inline and plays its order only on explicit playback", () => {
  render();
  press("打开歌单 清晨歌单");
  const html = render();
  expect(html).toContain("清晨歌单");
  expect(html).toContain("奇异恩典");
  expect(ui.dialogs.every((d) => !d.visible)).toBe(true);
  expect(ui.playQueue).not.toHaveBeenCalled();
  expect(useAppStore.getState().currentMusicPlaylist).toEqual({
    kind: "cloud",
    id: "morning",
  });
  press("播放 赞美");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[1], ui.hymns[0]], 0);
});

it("switches tabs and playlists without toggling playback or replacing the queue", () => {
  const id = useAppStore.getState().createMusicPlaylist("静心")!;
  useAppStore
    .getState()
    .addPlaylistHymn(id, { id: "grace", title: "奇异恩典" });
  expect(render()).toContain("静心");
  press("全部歌曲");
  expect(render()).toContain("赞美");
  press("静心");
  render();
  press("切换歌单");
  expect(render()).toContain("选择歌单");
  press("打开歌单 清晨歌单");
  render();
  expect(ui.dialogs.every((d) => !d.visible)).toBe(true);
  expect(ui.toggle).not.toHaveBeenCalled();
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("remembers the selected playlist after the screen remounts", () => {
  render();
  press("打开歌单 清晨歌单");
  ui.cells = [];
  expect(render()).toContain("奇异恩典");
  expect(ui.actions.some((a) => a.label === "切换歌单")).toBe(true);
});

it("creates an inline empty playlist and adds songs through their more menu", () => {
  render();
  press("新建歌单");
  render();
  input("清晨赞美");
  render();
  press("创建歌单");
  expect(render()).toContain("还没有歌曲");
  press("添加歌曲");
  render();
  expect(ui.actions.some((a) => a.label === "添加 奇异恩典 到歌单")).toBe(
    false,
  );
  press("更多操作 奇异恩典");
  render();
  press("添加到歌单");
  render();
  expect(ui.dialogs.some((d) => d.title === "添加到歌单" && d.visible)).toBe(
    false,
  );
  ui.dialogs.find((d) => d.title === "奇异恩典")!.onDismiss?.();
  render();
  press("加入 清晨赞美");
  expect(useAppStore.getState().musicPlaylists[0].hymns).toEqual([
    { id: "grace", title: "奇异恩典" },
  ]);
  expect(ui.playQueue).not.toHaveBeenCalled();
  press("清晨赞美");
  expect(render()).toContain("奇异恩典");
});

it("renames and deletes the current playlist while retaining liked songs", () => {
  const id = useAppStore.getState().createMusicPlaylist("清晨赞美")!;
  useAppStore.getState().toggleFavoriteHymn({ id: "grace", title: "奇异恩典" });
  render();
  press("歌单更多操作");
  render();
  press("重命名歌单");
  render();
  input("静心");
  render();
  press("保存名称");
  expect(render()).toContain("静心");
  render();
  press("歌单更多操作");
  render();
  press("删除歌单");
  expect(render()).toContain("收藏的歌曲会保留");
  press("确认删除歌单");
  expect(
    useAppStore.getState().musicPlaylists.find((p) => p.id === id),
  ).toBeUndefined();
  expect(useAppStore.getState().favoriteHymns).toHaveLength(1);
  expect(render()).not.toContain("歌单暂不可用");
});

it("keeps play, favorite and more controls in the all-songs rows", () => {
  render();
  press("全部歌曲");
  render();
  expect(ui.actions.some((a) => a.label === "更多操作 奇异恩典")).toBe(true);
  expect(ui.actions.some((a) => a.label === "添加 奇异恩典 到歌单")).toBe(
    false,
  );
  expect(ui.actions.some((a) => a.label === "播放 奇异恩典")).toBe(true);
  press("收藏 奇异恩典");
  expect(useAppStore.getState().favoriteHymns).toHaveLength(1);
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("retains unavailable favorites and skips them in the playback queue", () => {
  useAppStore.getState().toggleFavoriteHymn({ id: "gone", title: "旧诗歌" });
  useAppStore.getState().toggleFavoriteHymn({ id: "grace", title: "旧名称" });
  const html = render();
  expect(html).toContain("旧诗歌");
  expect(html).toContain("暂不可用");
  expect(html).toContain("奇异恩典");
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[0]], 0);
  expect(useAppStore.getState().favoriteHymns).toHaveLength(2);
});

it("shows a useful unavailable state for a missing saved cloud playlist", () => {
  useAppStore.setState({
    currentMusicPlaylist: { kind: "cloud", id: "missing" },
  });
  expect(render()).toContain("歌单暂不可用");
  expect(ui.actions.some((a) => a.label === "切换歌单")).toBe(true);
  expect(ui.playQueue).not.toHaveBeenCalled();
});

it("retries both catalogs when the song request has failed", async () => {
  ui.hymnStatus = "offline";
  expect(render()).toContain("平台诗歌暂时无法更新");
  await press("重试");
  expect(ui.refreshHymns).toHaveBeenCalledOnce();
  expect(ui.refreshPlaylists).toHaveBeenCalledOnce();
});

it("plays the complete catalog independently of the selected playlist", () => {
  render();
  press("打开歌单 清晨歌单");
  render();
  press("全部歌曲");
  render();
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith(ui.hymns, 0);
});

it("does not offer playback when the catalog is empty", () => {
  ui.hymns = [];
  render();
  press("全部歌曲");
  expect(render()).toContain("暂无可用的平台诗歌");
  expect(ui.actions.some((a) => a.label === "播放全部" && !a.disabled)).toBe(
    false,
  );
});

it("keeps all songs available when the remembered platform playlist is unavailable", () => {
  useAppStore.setState({
    currentMusicPlaylist: { kind: "cloud", id: "removed" },
  });
  render();
  press("全部歌曲");
  const html = render();
  expect(html).toContain("奇异恩典");
  expect(html).not.toContain("这张歌单暂时无法打开");
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith(ui.hymns, 0);
});

it("uses the collection name as the tab, exposes per-song play, and moves removal into more", () => {
  useAppStore.getState().toggleFavoriteHymn({ id: "grace", title: "奇异恩典" });
  const html = render();
  expect(ui.actions.some((a) => a.label === "我的收藏")).toBe(true);
  expect(ui.actions.some((a) => a.label === "取消收藏 奇异恩典")).toBe(false);
  expect(html).not.toContain("播放全部");
  expect(html.match(/我的收藏/g)).toHaveLength(2); // tab label and its visible text, with no duplicate heading
  press("播放 奇异恩典");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[0]], 0);
  render();
  press("更多操作 奇异恩典");
  render();
  press("从收藏移除");
  expect(useAppStore.getState().favoriteHymns).toEqual([]);
});
