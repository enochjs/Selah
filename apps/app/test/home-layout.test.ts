import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";

const harness = vi.hoisted(() => ({
  tracks: [] as AudioTrack[],
  current: undefined as AudioTrack | undefined,
  playing: false,
  playQueue: vi.fn(),
  actions: [] as { label?: string; onPress: () => void }[],
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
vi.mock("../src/features/audio/catalog", () => ({
  hymns: () => harness.tracks,
  chapterTracks: () => [],
}));
vi.mock("../src/data/bible-repository", () => ({
  audioChapters: [],
  bibleRepository: {
    getBook: () => ({ zh: "约翰福音", en: "John" }),
    getChapter: () => [{ number: 12, zh: "完整正文", en: "Full verse" }],
  },
}));
import { HomeScreen } from "../src/features/home/HomeScreen";
vi.mock("../src/features/home/HomeHighlights", () => ({
  HomeHighlights: () => null,
}));
it("offers continuing the saved passage before the scenic title", () => {
  const html = renderToStaticMarkup(React.createElement(HomeScreen));
  expect(html.indexOf("从这里继续")).toBeGreaterThan(-1);
  expect(html.indexOf("从这里继续")).toBeLessThan(html.indexOf("静下来"));
  expect(html).toContain("8:12");
});
