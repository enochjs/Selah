import React from "react";
import { beforeEach, expect, it } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { HymnDownloadButton } from "../src/features/downloads/HymnDownloadButton";
import { OfflineHymnsSection } from "../src/features/downloads/OfflineHymnsSection";
import { useAppStore } from "../src/state/app-store";
import type { AudioTrack } from "../src/domain/models";

const hymn = {
  id: "new-song",
  titleZh: "新歌",
  titleEn: "New song",
  subtitleZh: "歌手",
  subtitleEn: "Artist",
  duration: 20,
  enabled: true,
  audioPath: `/api/audio/hymns/${"a".repeat(64)}.mp3`,
  lyrics: "[00:01]歌词",
};
const track: AudioTrack = {
  id: hymn.id,
  title: hymn.titleZh,
  subtitle: hymn.subtitleZh,
  source: { uri: `https://example.test${hymn.audioPath}` },
  artwork: 1,
  kind: "hymn",
  hymn,
};
const file = { path: hymn.audioPath, size: 1234, sha256: "a".repeat(64) };
const item = {
  kind: "hymn" as const,
  key: `hymn:${hymn.id}`,
  hymn,
  files: [file],
};
const plan = {
  chapters: [item],
  bytes: 1234,
  totalBytes: 1234,
  availableBytes: 9000,
};
const render = () => draw(React.createElement(HymnDownloadButton, { track }));
beforeEach(() => {
  resetUI();
  useAppStore.setState(useAppStore.getInitialState(), true);
  ui.prepareHymn.mockResolvedValue(plan);
});
it("confirms the song size and Wi-Fi preference before enqueueing without changing playback", async () => {
  render();
  await press("下载 新歌");
  expect(ui.prepareHymn).toHaveBeenCalledWith(hymn);
  expect(render()).toContain("音频与歌词离线可用");
  expect(ui.enqueue).not.toHaveBeenCalled();
  await press("开始下载");
  expect(ui.enqueue).toHaveBeenCalledWith(plan, true);
  expect(ui.playQueue).not.toHaveBeenCalled();
});
it("pauses an active transfer and resumes a failed song", async () => {
  ui.offline.chapters[item.key] = { ...item, status: "downloading" };
  render();
  await press("暂停下载 新歌");
  expect(ui.pauseDownload).toHaveBeenCalledWith([item.key]);
  ui.offline.chapters[item.key] = {
    ...item,
    status: "failed",
    error: "network",
  };
  render();
  await press("重试下载 新歌");
  expect(ui.resumeDownload).toHaveBeenCalledWith([item.key]);
});
it("requires confirmation before removing local audio and retains favorites and playlists", async () => {
  useAppStore
    .getState()
    .toggleFavoriteHymn({ id: hymn.id, title: hymn.titleZh });
  ui.offline.chapters[item.key] = { ...item, status: "complete" };
  render();
  await press("新歌 已下载 · 管理下载");
  expect(render()).toContain("收藏和歌单会保留");
  expect(ui.removeDownload).not.toHaveBeenCalled();
  await press("移除下载");
  expect(ui.removeDownload).toHaveBeenCalledWith([item.key]);
  expect(useAppStore.getState().favoriteHymns).toHaveLength(1);
});
it("shows a recoverable preparation error without starting a download", async () => {
  ui.prepareHymn.mockRejectedValueOnce(new Error("offline"));
  render();
  await press("下载 新歌");
  expect(render()).toContain("暂时无法准备下载");
  expect(ui.enqueue).not.toHaveBeenCalled();
});
it("lists downloaded songs independently of Bible language and plays only completed songs", async () => {
  ui.offline.chapters[item.key] = { ...item, status: "complete" };
  ui.offline.chapters["hymn:pending"] = {
    ...item,
    key: "hymn:pending",
    hymn: { ...hymn, id: "pending", titleZh: "未完成" },
    status: "paused",
  };
  const html = draw(React.createElement(OfflineHymnsSection));
  expect(html).toContain("诗歌下载");
  expect(html).toContain("离线可用");
  expect(html).toContain("已暂停");
  await press("离线播放 新歌");
  expect(ui.playQueue).toHaveBeenCalledWith(
    [expect.objectContaining({ id: hymn.id })],
    0,
  );
  expect(
    ui.actions.find((action) => action.label === "离线播放 未完成")?.disabled,
  ).toBe(true);
});
