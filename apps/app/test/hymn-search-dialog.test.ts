import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";

const harness = vi.hoisted(() => ({
  query: "",
  width: 393,
  tracks: [] as AudioTrack[],
  status: "ready" as "loading" | "ready" | "offline",
  refresh: vi.fn(),
  track: null as AudioTrack | null,
  playing: false,
  playQueue: vi.fn(),
  toggle: vi.fn(),
  actions: new Map<string, () => void>(),
  input: undefined as
    | undefined
    | {
        autoFocus: boolean;
        onChangeText: (query: string) => void;
      },
  dialog: undefined as
    | undefined
    | {
        onDismiss: () => void;
        presentation: string;
        heightMode: string;
        keyboardAware: boolean;
      },
  scroll: undefined as undefined | { keyboardShouldPersistTaps: string },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [
    harness.query,
    (query: string) => {
      harness.query = query;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({ children, ...props }: PropsWithChildren) => {
    harness.scroll = props as typeof harness.scroll;
    return React.createElement("section", null, children);
  },
  TextInput: (props: typeof harness.input) => {
    harness.input = props;
    return React.createElement("input");
  },
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    harness.actions.set(accessibilityLabel, onPress);
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel },
      children,
    );
  },
  useWindowDimensions: () => ({ width: harness.width }),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  Dialog: ({
    children,
    title,
    ...props
  }: PropsWithChildren<{ title: string }>) => {
    harness.dialog = props as typeof harness.dialog;
    return React.createElement("div", null, title, children);
  },
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    harness.actions.set(label, onPress);
    return React.createElement("button", { "aria-label": label });
  },
  Button: ({
    children,
    onPress,
  }: PropsWithChildren<{ onPress: () => void }>) => {
    harness.actions.set(String(children), onPress);
    return React.createElement("button", null, children);
  },
  inputStyle: () => ({}),
}));
vi.mock("lucide-react-native", () => ({
  X: () => null,
  Play: () => null,
  Pause: () => null,
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymnCatalog: () => ({
    tracks: harness.tracks,
    status: harness.status,
    refresh: harness.refresh,
  }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    track: harness.track,
    playing: harness.playing,
    playQueue: harness.playQueue,
    toggle: harness.toggle,
  }),
}));
import { HymnSearchDialog } from "../src/features/audio/HymnSearchDialog";

function song(
  id: string,
  title: string,
  subtitle: string,
  titleEn: string,
): AudioTrack {
  return {
    id,
    title,
    subtitle,
    kind: "hymn",
    source: { uri: `/audio/${id}.mp3` },
    artwork: 1,
    duration: 180,
    hymn: {
      id,
      titleZh: title,
      titleEn,
      subtitleZh: subtitle,
      subtitleEn: "English artist",
      audioPath: `/audio/${id}.mp3`,
      duration: 180,
      enabled: true,
    },
  };
}
const close = vi.fn();
function render() {
  harness.actions.clear();
  return renderToStaticMarkup(
    React.createElement(HymnSearchDialog, { visible: true, onClose: close }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  harness.query = "";
  harness.width = 393;
  harness.status = "ready";
  harness.track = null;
  harness.playing = false;
  harness.tracks = [
    song("one", "哈利路亚", "邓紫棋 · 现场版", "Hallelujah"),
    song("two", "哈利路亚", "Molly Sandén · 瑞典语版", "Hallelujah"),
    song("three", "良人和我", "迦南诗选", "My Beloved and I"),
  ];
});
it("focuses the hymn input above a keyboard-tappable mobile result list", () => {
  const html = render();
  expect(html).toContain("搜索诗歌");
  expect(html).toContain("输入歌名或演唱者");
  expect(html.indexOf("<input")).toBeLessThan(html.indexOf("<section"));
  expect(harness.input?.autoFocus).toBe(true);
  expect(harness.scroll?.keyboardShouldPersistTaps).toBe("handled");
  expect(harness.dialog).toMatchObject({
    presentation: "bottom",
    keyboardAware: true,
    heightMode: "large",
  });
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it.each(["哈", " HALLELUJAH ", "邓紫棋", "ｍｏｌｌｙ"])(
  "searches names and artists with %s",
  (query) => {
    render();
    harness.input!.onChangeText(query);
    const html = render();
    expect(html).toContain("哈利路亚");
    expect(html).not.toContain("良人和我");
    expect(html).toContain(
      query.trim().toLowerCase().includes("hallelujah") || query === "哈"
        ? "找到 2 首诗歌"
        : "找到 1 首诗歌",
    );
  },
);
it("clears an unmatched query and returns to the initial prompt", () => {
  harness.query = "不存在的歌曲";
  expect(render()).toContain("没有匹配的诗歌");
  harness.actions.get("清空搜索")!();
  expect(render()).toContain("输入歌名或演唱者");
});
it("finds the artist when the album subtitle omits the performer", () => {
  const hymn = {
    ...harness.tracks[2].hymn!,
    subtitleZh: "经典诗歌精选",
    artist: "爱与扶持音乐事工",
  };
  harness.tracks[2] = { ...harness.tracks[2], subtitle: hymn.subtitleZh, hymn };
  harness.query = "爱与扶持";
  expect(render()).toContain("找到 1 首诗歌");
  expect(harness.actions.has("播放 良人和我 · 经典诗歌精选")).toBe(true);
});
it("plays the selected recording in the filtered result queue after dismissing", () => {
  harness.query = "哈利路亚";
  render();
  harness.actions.get("播放 哈利路亚 · Molly Sandén · 瑞典语版")!();
  expect(close).toHaveBeenCalledOnce();
  expect(harness.playQueue).not.toHaveBeenCalled();
  harness.dialog!.onDismiss();
  expect(harness.playQueue).toHaveBeenCalledExactlyOnceWith(
    harness.tracks.slice(0, 2),
    1,
  );
  harness.dialog!.onDismiss();
  expect(harness.playQueue).toHaveBeenCalledOnce();
});
it("toggles the current recording without rebuilding its queue", () => {
  harness.query = "邓紫棋";
  harness.track = harness.tracks[0];
  harness.playing = true;
  render();
  harness.actions.get("暂停 哈利路亚 · 邓紫棋 · 现场版")!();
  harness.dialog!.onDismiss();
  expect(harness.toggle).toHaveBeenCalledOnce();
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it("shows cached matches while offline and offers a catalog retry", () => {
  harness.status = "offline";
  harness.query = "良人";
  const html = render();
  expect(html).toContain("当前使用已缓存的歌库");
  expect(html).toContain("找到 1 首诗歌");
  harness.actions.get("重试")!();
  expect(harness.refresh).toHaveBeenCalledOnce();
});
it("shows loading while an empty catalog refreshes", () => {
  harness.status = "loading";
  harness.tracks = [];
  harness.query = "哈利";
  const html = render();
  expect(html).toContain("正在加载诗歌");
  expect(html).not.toContain("没有匹配的诗歌");
});
it("centers the search panel on desktop", () => {
  harness.width = 1200;
  render();
  expect(harness.dialog?.presentation).toBe("center");
});
