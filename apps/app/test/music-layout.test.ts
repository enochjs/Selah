import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";

const harness = vi.hoisted(() => ({
  tracks: [] as AudioTrack[],
  current: undefined as AudioTrack | undefined,
  playing: false,
  playQueue: vi.fn(),
  actions: [] as {
    label?: string;
    onPress: () => void;
    text?: string;
    role?: string;
    minHeight?: number;
  }[],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Image: () => null,
  StyleSheet: { absoluteFill: {} },
  ImageBackground: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ActivityIndicator: () => null,
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityRole,
    onPress,
    style,
  }: PropsWithChildren<{
    accessibilityLabel?: string;
    accessibilityRole?: string;
    onPress: () => void;
    style?: { minHeight?: number };
  }>) => {
    const text = renderToStaticMarkup(
      React.createElement(React.Fragment, null, children),
    ).replace(/<[^>]*>/g, "");
    harness.actions.push({
      label: accessibilityLabel,
      onPress,
      text,
      role: accessibilityRole,
      minHeight: style?.minHeight,
    });
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel },
      children,
    );
  },
  useWindowDimensions: () => ({ width: 1000 }),
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "ArrowUpRight",
      "ArrowRight",
      "Sprout",
      "Play",
      "Quote",
      "Leaf",
      "BookOpen",
      "Bookmark",
      "Pause",
      "Plus",
      "Music2",
      "Headphones",
      "Trash2",
      "Download",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("react-native-svg", () => ({
  default: () => null,
  Circle: () => null,
}));
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("../src/features/audio/media-storage", () => ({
  audioUri: vi.fn(),
  saveAudio: vi.fn(),
  deleteAudio: vi.fn(),
}));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("../src/shared/theme", () => ({
  typeScale: { caption: 12, label: 13, body: 14 },
  colors: {},
  fonts: {},
  images: { morning: 1 },
}));
vi.mock("../src/shared/ui", () => {
  const Wrap = ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children);
  return {
    Txt: Wrap,
    Panel: Wrap,
    Eyebrow: Wrap,
    Pill: Wrap,
    Dialog: () => null,
    Button: ({
      children,
      disabled,
    }: PropsWithChildren<{ disabled?: boolean }>) =>
      React.createElement("button", { disabled }, children),
    IconButton: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) => {
      harness.actions.push({ label, onPress });
      return React.createElement("button", { "aria-label": label });
    },
  };
});
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({
      words: [],
      reviews: [],
      bookmarks: [],
      dailyGoal: 5,
      readingPosition: { bookId: "john", chapter: 8, verse: 12 },
      songs: [
        {
          id: "local-song",
          title: "我的诗歌",
          uri: "local",
          addedAt: "2026-10-25",
        },
      ],
      primaryLocale: "en",
      notify: vi.fn(),
    }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    playQueue: harness.playQueue,
    track: harness.current,
    playing: harness.playing,
  }),
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymns: () => harness.tracks,
}));
vi.mock("../src/features/audio/catalog", () => ({
  hymns: () => harness.tracks,
  chapterTracks: () => [],
}));
vi.mock("../src/data/bible-repository", () => ({
  audioChapters: [{ bookId: "john", chapter: 8 }],
  bibleRepository: {
    getBook: () => ({ zh: "约翰福音", en: "John" }),
    getChapter: () => [{ number: 12, zh: "完整正文", en: "Full verse" }],
  },
}));
import { MusicScreen } from "../src/features/audio/MusicScreen";
beforeEach(() => {
  harness.actions = [];
  harness.current = undefined;
  harness.playing = false;
});
it("keeps hymns and local music without the scripture recommendation section", () => {
  const html = renderToStaticMarkup(React.createElement(MusicScreen));
  expect(html).not.toContain("聆听话语");
  expect(html).not.toContain("边读边听");
  expect(html).toContain("让心，在赞美中安静。");
  expect(html).toContain("我的诗歌收藏");
  expect(harness.actions.some((action) => action.label === "离线音频")).toBe(
    true,
  );
});
it.each([
  [false, false, "播放诗歌"],
  [true, false, "继续播放诗歌"],
  [true, true, "暂停诗歌"],
] as const)(
  "labels local playback for current=%s playing=%s",
  (current, playing, label) => {
    harness.current = current
      ? {
          id: "local-song",
          title: "我的诗歌",
          subtitle: "本地",
          artwork: 1,
          kind: "hymn",
          source: 1,
        }
      : undefined;
    harness.playing = playing;
    renderToStaticMarkup(React.createElement(MusicScreen));
    expect(harness.actions.some((action) => action.label === label)).toBe(true);
  },
);

it("keeps the local-song title a separate 44px target", () => {
  renderToStaticMarkup(React.createElement(MusicScreen));
  const localTitle = harness.actions.find(
    (action) =>
      action.role === "button" && action.text?.startsWith("我的诗歌本地收藏"),
  );
  expect(localTitle).toBeDefined();
  expect(localTitle!.minHeight ?? 0).toBeGreaterThanOrEqual(44);
});
