import React, { type PropsWithChildren } from "react";
import type { AudioTrack } from "../src/domain/models";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { ChapterPagerProps } from "../src/features/reader/chapter-pager-props";

const context = vi.hoisted(() => ({
  width: 393,
  pathname: "/bible",
  onScroll: vi.fn(),
  pager: null as ChapterPagerProps | null,
  iconActions: new Map<string, () => void>(),
  verseMinHeights: [] as (number | undefined)[],
  tracks: [] as AudioTrack[],
  audio: {
    track: null as AudioTrack | null,
    playing: false,
    toggle: vi.fn(),
    playQueue: vi.fn(),
  },
  scrollHandlers: [] as ((event: {
    nativeEvent: { contentOffset: { y: number } };
  }) => void)[],
  state: {
    hydrated: true,
    locale: "zh",
    primaryLocale: "en",
    showTranslation: true,
    lineHeight: 1.6,
    fontSize: 18,
    bookId: "1-kings",
    chapter: 17,
    selectedVerse: 1,
    bookmarks: [],
    words: [],
    recentReadings: [],
    followingNarration: false,
    setFollowingNarration: vi.fn(),
    readerHeaderCollapsed: false,
    setReaderHeaderCollapsed: vi.fn(),
    setChapter: vi.fn(),
    setPrimaryLocale: vi.fn(),
    setShowTranslation: vi.fn(),
    setLocale: vi.fn(),
    notify: vi.fn(),
  },
}));
vi.mock("react-native", () => {
  const element = ({
    children,
    style,
    accessibilityLabel,
    ...handlers
  }: PropsWithChildren<{ style?: object; accessibilityLabel?: string }>) => {
    return React.createElement(
      "div",
      { style, "aria-label": accessibilityLabel },
      children,
    );
  };
  const ScrollView = ({
    children,
    onScroll,
  }: PropsWithChildren<{
    onScroll?: (typeof context.scrollHandlers)[number];
  }>) => {
    if (onScroll) context.scrollHandlers.push(onScroll);
    return React.createElement("div", null, children);
  };
  return {
    View: element,
    ScrollView,
    Animated: {
      ScrollView,
      Value: class {
        setValue() {}
        stopAnimation() {}
      },
    },
    Pressable: ({
      children,
      accessibilityLabel,
      accessible,
      style,
    }: PropsWithChildren<{
      accessibilityLabel?: string;
      accessible?: boolean;
      style?: { minHeight?: number };
    }>) => {
      if (accessible === false) context.verseMinHeights.push(style?.minHeight);
      return React.createElement(
        "button",
        { "aria-label": accessibilityLabel },
        children,
      );
    },
    TextInput: () => null,
    useWindowDimensions: () => ({ width: context.width, height: 852 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("react-native-svg", () => ({ default: () => null, Path: () => null }));
vi.mock("lucide-react-native", () => ({
  BookOpen: () => null,
  ChevronDown: () => null,
  ChevronLeft: () => null,
  ChevronRight: () => null,
  Headphones: () => null,
  Play: () => null,
  Pause: () => null,
  Repeat1: () => null,
  ArrowLeftRight: () => null,
  Bookmark: () => null,
  Type: () => null,
  Check: () => null,
  House: () => null,
  BookMarked: () => null,
  Settings: () => null,
  Search: () => null,
  Globe2: () => null,
  Sprout: () => null,
  X: () => null,
  MoreHorizontal: () => null,
}));
vi.mock("../src/features/reader/ScriptureSearchDialog", () => ({
  ScriptureSearchDialog: () => null,
}));
vi.mock("../src/features/reader/SavedVersesDialog", () => ({
  SavedVersesDialog: () => null,
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13, body: 14 },
  images: {},
}));
vi.mock("../src/shared/ui", () => {
  const Text = ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children);
  return {
    Txt: Text,
    Pill: Text,
    Eyebrow: Text,
    inputStyle: {},
    IconButton: ({
      label,
      onPress,
    }: {
      label: string;
      onPress: () => void;
    }) => {
      context.iconActions.set(label, onPress);
      return React.createElement("button", { "aria-label": label });
    },
    Dialog: ({
      visible,
      title,
      children,
    }: PropsWithChildren<{ visible: boolean; title: string }>) =>
      visible
        ? React.createElement("section", { "aria-label": title }, children)
        : null,
  };
});
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ locale: "zh", bi: (zh: string) => zh }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(
    (select: (state: typeof context.state) => unknown) => select(context.state),
    {
      getState: () => context.state,
    },
  ),
}));
vi.mock("expo-router", () => ({
  usePathname: () => context.pathname,
  Slot: () => React.createElement(ReaderScreen),
  router: { push: vi.fn() },
}));
vi.mock("../src/features/reader/useReadingProgress", () => ({
  useReadingProgress: () => ({
    scrollToVerse: vi.fn(),
    isForeground: () => true,
    flush: vi.fn(),
    onLayout: vi.fn(),
    onContentSizeChange: vi.fn(),
    onScroll: context.onScroll,
    registerVerse: vi.fn(),
  }),
}));
vi.mock("../src/features/reader/ChapterPager", () => ({
  ChapterPager: (props: ChapterPagerProps) => {
    context.pager = props;
    return props.renderPage(props.pages[props.index], true);
  },
}));
vi.mock("../src/features/reader/useReaderBackGuard", () => ({
  useReaderBackGuard: () => {},
}));
vi.mock("../src/features/reader/reader-input", () => ({
  useChapterKeyboard: () => {},
  hasTextSelection: () => false,
}));
vi.mock("../src/features/reader/VerseText", () => ({ VerseText: () => null }));
vi.mock("../src/features/vocabulary/WordDialog", () => ({
  WordDialog: () => null,
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => context.audio,
}));
vi.mock("../src/data/audio-repository", () => ({
  hasChapterAudio: () => false,
}));
vi.mock("../src/features/audio/catalog", () => ({
  chapterTracks: () => context.tracks,
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: () => null,
}));
vi.mock("../src/features/audio/PlayerBar", () => ({ PlayerBar: () => null }));
vi.mock("../src/features/audio/NowPlayingButton", () => ({
  NowPlayingButton: () => null,
}));
vi.mock("../src/features/vocabulary/VocabularyTabs", () => ({
  VocabularyTabs: () => null,
}));

import { ReaderScreen } from "../src/features/reader/ReaderScreen";
import { ChapterPicker } from "../src/features/reader/ChapterPicker";
import { Shell } from "../src/shared/Shell";

beforeEach(() => {
  context.tracks = [];
  context.audio.track = null;
  context.audio.playing = false;
  context.state.selectedVerse = 1;
  context.width = 393;
  context.pathname = "/bible";
  context.state.readerHeaderCollapsed = false;
  context.scrollHandlers = [];
  context.iconActions.clear();
  context.verseMinHeights = [];
  vi.clearAllMocks();
});
it("offers separate book and chapter buttons in the reading toolbar", () => {
  const html = renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(html).toMatch(
    /aria-label="选择书卷"[^>]*>[\s\S]*?列王纪上[\s\S]*?<\/button>/,
  );
  expect(html).toMatch(
    /aria-label="选择章节"[^>]*>[\s\S]*?17[\s\S]*?<\/button>/,
  );
});
it("uses a single mobile reading header from the top and keeps scrolling independent of chrome", () => {
  const html = renderToStaticMarkup(React.createElement(Shell));
  expect(html).toContain('aria-label="selah"');
  expect(html).toContain(">selah<");
  for (const label of ["更多", "朗读本章"])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).not.toContain("英文主读");
  for (const y of [0, 90, 35, 0])
    context.scrollHandlers.forEach((handler) =>
      handler({ nativeEvent: { contentOffset: { y } } }),
    );
  expect(context.onScroll).toHaveBeenCalledTimes(4);
  expect(context.state.setReaderHeaderCollapsed).not.toHaveBeenCalled();
});
it("keeps the brand and global actions on other mobile pages", () => {
  context.pathname = "/";
  const html = renderToStaticMarkup(React.createElement(Shell));
  expect(html).toContain("selah");
  expect(html).toContain('aria-label="搜索经文"');
  expect(html).toContain('aria-label="设置"');
});
it("opens book selection directly from the book entry", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChapterPicker, {
      visible: true,
      initialView: "books",
      onClose: () => {},
    }),
  );
  expect(html).toContain('aria-label="选择书卷"');
  expect(html).toContain("出埃及记");
  expect(html).not.toContain('aria-label="列王纪上 17"');
});
it("opens the current book's chapter grid directly from the chapter entry", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChapterPicker, {
      visible: true,
      initialView: "chapters",
      onClose: () => {},
    }),
  );
  expect(html).toContain('aria-label="列王纪上 17"');
  expect(html).not.toContain("出埃及记");
});

it.each([320, 393, 768])(
  "keeps the brand, book/chapter entries, narration and More at %ipx",
  (width) => {
    context.width = width;
    const html = renderToStaticMarkup(React.createElement(Shell));
    for (const label of ["选择书卷", "选择章节", "selah", "更多", "朗读本章"])
      expect(html).toContain(`aria-label="${label}"`);
    expect(html).not.toContain('aria-label="阅读设置"');
    expect(html).not.toContain('aria-label="搜索经文"');
    expect(html).not.toContain('aria-label="珍藏的经文"');
    expect(html).not.toContain('aria-label="设置"');
    expect(html.includes(">selah<")).toBe(width >= 380);
  },
);
it("keeps the desktop toolbar focused on the chapter without duplicating the sidebar brand", () => {
  context.width = 1200;
  const html = renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(html).not.toContain("selah");
  expect(html).not.toContain('aria-label="更多"');
  for (const label of ["上一章", "下一章", "设置", "朗读本章"])
    expect(html).toContain(`aria-label="${label}"`);
});

const recording: AudioTrack = {
  id: "1-kings-17-en-1",
  title: "1 Kings 17:1",
  subtitle: "",
  source: { uri: "https://example.test/1-kings-17.mp3" },
  kind: "scripture",
  artwork: 1,
  bookId: "1-kings",
  chapter: 17,
  verse: 1,
  locale: "en",
};
function tapNarration(label = "朗读本章") {
  renderToStaticMarkup(React.createElement(ReaderScreen));
  const press = context.iconActions.get(label);
  expect(press).toBeDefined();
  press?.();
}
it("starts narration directly at the selected verse", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  context.state.selectedVerse = 2;
  tapNarration();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
  expect(context.state.setFollowingNarration).toHaveBeenCalledWith(true);
  expect(context.audio.toggle).not.toHaveBeenCalled();
});
it.each([true, false])(
  "toggles the loaded chapter without reloading audio, playing=%s",
  (playing) => {
    context.tracks = [recording];
    context.audio.track = recording;
    context.audio.playing = playing;
    tapNarration(playing ? "暂停朗读" : "继续朗读");
    expect(context.audio.toggle).toHaveBeenCalledOnce();
    expect(context.audio.playQueue).not.toHaveBeenCalled();
  },
);
it.each([
  { ...recording, chapter: 16 },
  { ...recording, locale: "zh" as const },
  { ...recording, kind: "hymn" as const },
])(
  "starts the displayed chapter instead of toggling a different recording (%j)",
  (track) => {
    context.tracks = [recording];
    context.audio.track = track;
    context.audio.playing = true;
    tapNarration();
    expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 0);
    expect(context.audio.toggle).not.toHaveBeenCalled();
  },
);
it("plays chapter-only audio directly even when a later verse is selected", () => {
  context.tracks = [{ ...recording, verse: undefined }];
  context.state.selectedVerse = 12;
  tapNarration();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 0);
});
it("reports unavailable chapter audio without affecting another recording", () => {
  context.audio.track = { ...recording, chapter: 16 };
  tapNarration();
  expect(context.state.notify).toHaveBeenCalledOnce();
  expect(context.audio.toggle).not.toHaveBeenCalled();
  expect(context.audio.playQueue).not.toHaveBeenCalled();
});

it("keeps short verses at a compact minimum height regardless of selection", () => {
  renderToStaticMarkup(React.createElement(ReaderScreen));
  const before = [...context.verseMinHeights];
  expect(new Set(before)).toEqual(new Set([156]));
  context.state.selectedVerse = 2;
  context.verseMinHeights = [];
  renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(context.verseMinHeights).toEqual(before);
});

it("selects the chapter only after the native pager reports a settled page", () => {
  renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(context.state.setChapter).not.toHaveBeenCalled();
  context.pager?.onSelect({ bookId: "1-kings", chapter: 18 });
  expect(context.state.setChapter).toHaveBeenCalledWith("1-kings", 18);
});

it("provides current and adjacent chapter data to the pager without rendering a duplicate toolbar", () => {
  const html = renderToStaticMarkup(React.createElement(ReaderScreen));
  const pager = context.pager;
  expect(pager).not.toBeNull();
  if (!pager) throw new Error("missing pager");
  expect(pager.pages[pager.index - 1]).toEqual({
    bookId: "1-kings",
    chapter: 16,
  });
  expect(pager.pages[pager.index + 1]).toEqual({
    bookId: "1-kings",
    chapter: 18,
  });
  expect(pager.enabled).toBe(true);
  expect(html.match(/aria-label="选择章节"/g)).toHaveLength(1);
});
