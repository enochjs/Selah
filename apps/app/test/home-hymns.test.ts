import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";
vi.mock("../src/features/audio/HymnNowPlaying", () => ({
  HymnNowPlaying: () => null,
}));

const harness = vi.hoisted(() => ({
  tracks: [] as AudioTrack[],
  playQueue: vi.fn(),
  actions: [] as { label?: string; onPress: () => void }[],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Image: () => null,
  ImageBackground: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ActivityIndicator: () => null,
  TextInput: () => null,
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel?: string;
    onPress: () => void;
  }>) => {
    harness.actions.push({ label: accessibilityLabel, onPress });
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
      "Bookmark",
      "Pause",
      "Plus",
      "Music2",
      "Headphones",
      "Trash2",
      "Download",
      "Heart",
      "Cloud",
      "BookOpen",
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
    inputStyle: {},
    Button: ({
      children,
      disabled,
    }: PropsWithChildren<{ disabled?: boolean }>) =>
      React.createElement("button", { disabled }, children),
    IconButton: () => null,
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
      songs: [],
      favoriteHymns: [],
      musicPlaylists: [],
      primaryLocale: "en",
      notify: vi.fn(),
    }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ playQueue: harness.playQueue }),
}));
vi.mock("../src/features/audio/catalog", () => ({
  hymns: () => harness.tracks,
  chapterTracks: () => [],
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymns: () => harness.tracks,
  useHymnCatalog: () => ({
    tracks: harness.tracks,
    status: "ready",
    refresh: vi.fn(),
  }),
}));
vi.mock("../src/features/audio/useCloudPlaylists", () => ({
  useCloudPlaylists: () => ({ items: [], status: "ready", refresh: vi.fn() }),
}));
vi.mock("../src/data/bible-repository", () => ({
  audioChapters: [],
  bibleRepository: {
    getBook: () => ({ zh: "约翰福音", en: "John" }),
    getChapter: () => [],
  },
}));
import { MusicScreen } from "../src/features/audio/MusicScreen";
import { HomeHighlights } from "../src/features/home/HomeHighlights";

beforeEach(() => {
  harness.actions = [];
  harness.playQueue.mockClear();
});
it("shows and plays the first enabled hymn using its current title and description", () => {
  harness.tracks = [
    {
      id: "be-thou-my-vision",
      title: "成为我异象（钢琴）",
      subtitle: "更新后的介绍",
      kind: "hymn",
      source: 1,
      artwork: 2,
    },
  ];
  const html = renderToStaticMarkup(React.createElement(HomeHighlights));
  expect(html).toContain("成为我异象（钢琴）");
  expect(html).toContain("更新后的介绍");
  expect(html).not.toContain("奇异恩典");
  const action = harness.actions.find(
    (action) => action.label === "播放成为我异象（钢琴）",
  );
  expect(action).toBeDefined();
  action!.onPress();
  expect(harness.playQueue).toHaveBeenCalledWith(harness.tracks, 0);
});
it("shows an empty state without a hymn play action when all hymns are disabled", () => {
  harness.tracks = [];
  const html = renderToStaticMarkup(React.createElement(HomeHighlights));
  expect(html).toContain("暂无可用的平台诗歌");
  expect(
    harness.actions.some((action) => action.label?.startsWith("播放")),
  ).toBe(false);
});

it("disables the listening page playlist when all platform hymns are disabled", () => {
  harness.tracks = [];
  const html = renderToStaticMarkup(React.createElement(MusicScreen));
  expect(html).toMatch(
    /<button[^>]*disabled[^>]*>暂无可用的平台诗歌<\/button>/,
  );
});
