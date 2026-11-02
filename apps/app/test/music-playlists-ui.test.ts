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

it("retries both song and playlist catalogs when only the song request has failed", async () => {
  ui.hymnStatus = "offline";
  expect(render()).toContain("平台诗歌暂时无法更新");
  await press("重试");
  expect(ui.refreshHymns).toHaveBeenCalledOnce();
  expect(ui.refreshPlaylists).toHaveBeenCalledOnce();
});

it("shows cloud and personal collections without exposing personal upload or import actions", () => {
  const html = render();
  expect(html).toContain("云歌单");
  expect(html).toContain("清晨歌单");
  expect(html).toContain("我的音乐");
  expect(html).toContain("我喜欢的");
  expect(html).not.toMatch(/导入|上传|选择本地音频/);
  expect(ui.actions.some((a) => a.label === "新建歌单")).toBe(true);
});

it("opens a server playlist, plays in its order, and favorites without starting playback", () => {
  render();
  press("打开歌单 清晨歌单");
  render();
  press("收藏 奇异恩典");
  expect(useAppStore.getState().favoriteHymns).toEqual([
    { id: "grace", title: "奇异恩典" },
  ]);
  expect(ui.playQueue).not.toHaveBeenCalled();
  render();
  press("取消收藏 奇异恩典");
  expect(useAppStore.getState().favoriteHymns).toEqual([]);
  press("播放全部");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[1], ui.hymns[0]]);
});

it("creates an empty playlist, adds cloud songs, reorders them, renames and deletes it while retaining favorites", () => {
  render();
  press("新建歌单");
  render();
  input("清晨赞美");
  render();
  press("创建歌单");
  const id = useAppStore.getState().musicPlaylists[0].id;
  expect(render()).toContain("去云歌单选歌");
  press("去云歌单选歌");
  render();
  press("添加 奇异恩典 到歌单");
  render();
  press("加入 清晨赞美");
  expect(useAppStore.getState().musicPlaylists[0].hymns).toHaveLength(1);
  render();
  press("添加 赞美 到歌单");
  render();
  press("加入 清晨赞美");
  useAppStore.getState().toggleFavoriteHymn({ id: "grace", title: "奇异恩典" });
  render();
  press("打开歌单 清晨赞美");
  render();
  press("上移 赞美");
  expect(
    useAppStore.getState().musicPlaylists[0].hymns.map((s) => s.id),
  ).toEqual(["praise", "grace"]);
  render();
  press("重命名歌单");
  render();
  input("静心");
  render();
  press("保存名称");
  expect(useAppStore.getState().musicPlaylists[0].name).toBe("静心");
  render();
  press("删除歌单");
  expect(render()).toContain("收藏的歌曲会保留");
  press("确认删除歌单");
  expect(
    useAppStore.getState().musicPlaylists.find((p) => p.id === id),
  ).toBeUndefined();
  expect(useAppStore.getState().favoriteHymns).toHaveLength(1);
});

it("retains unavailable favorites, skips them in queues and shows a recovery action when offline", () => {
  useAppStore.getState().toggleFavoriteHymn({ id: "gone", title: "旧诗歌" });
  useAppStore.getState().toggleFavoriteHymn({ id: "grace", title: "旧名称" });
  ui.cloudStatus = "offline";
  expect(render()).toContain("云歌单暂时无法更新");
  press("打开我喜欢的");
  const html = render();
  expect(html).toContain("旧诗歌");
  expect(html).toContain("暂不可用");
  expect(html).toContain("奇异恩典");
  press("播放全部");
  expect(ui.playQueue).toHaveBeenCalledWith([ui.hymns[0]]);
  expect(useAppStore.getState().favoriteHymns).toHaveLength(2);
});
