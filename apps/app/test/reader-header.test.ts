import React, { type PropsWithChildren, type CSSProperties } from "react";
import type { AudioTrack, ChapterRecording } from "../src/domain/models";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

import type { ChapterPagerProps } from "../src/features/reader/chapter-pager-props";

const context = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  width: 393,
  safeAreas: [] as { edges: readonly string[]; style?: CSSProperties }[],
  tabOptions: null as Record<string, unknown> | null,
  tabRoutes: new Map<string, Record<string, unknown> | undefined>(),
  pathname: "/bible",
  runEffects: false,
  foreground: true,
  flush: vi.fn(),
  prepareForViewportShift: vi.fn(),
  headerStyle: undefined as CSSProperties | undefined,
  scrollContentStyles: [] as CSSProperties[],
  onScroll: vi.fn(),
  pager: null as ChapterPagerProps | null,
  iconActions: new Map<string, () => void>(),
  wordActions: new Map<number, (word: string) => void>(),
  wordDialog: null as { selection: unknown; onClose: () => void } | null,
  verseMinHeights: [] as (number | undefined)[],
  tracks: [] as AudioTrack[],
  recording: null as ChapterRecording | null,
  audio: {
    track: null as AudioTrack | null,
    playing: false,
    repeat: "off" as "off" | "verse",
    toggle: vi.fn(),
    playQueue: vi.fn(),
    setRepeat: vi.fn(),
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
    readerChromeHidden: false,
    setReaderChromeHidden: vi.fn(),
    bookmarks: [],
    words: [],
    recentReadings: [],
    followingNarration: false,
    setFollowingNarration: vi.fn(),
    followNarration: vi.fn(),
    setSelectedVerse: vi.fn(),
    toggleBookmark: vi.fn(),
    setChapter: vi.fn(),
    openReadingPosition: vi.fn(),
    setPrimaryLocale: vi.fn(),
    setShowTranslation: vi.fn(),
    setLocale: vi.fn(),
    notify: vi.fn(),
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (effect: () => unknown) => {
    if (context.runEffects) effect();
  },
  useImperativeHandle: (ref: React.Ref<unknown>, create: () => unknown) => {
    if (typeof ref === "function") ref(create());
    else if (ref) ref.current = create();
  },
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells)) context.cells[index] = initial;
    return [
      context.cells[index],
      (next: unknown) => {
        context.cells[index] = next;
      },
    ];
  },
}));
vi.mock("react-native", () => {
  const element = ({
    children,
    style,
    accessibilityLabel,
    ...handlers
  }: PropsWithChildren<{ style?: object; accessibilityLabel?: string }>) => {
    if (accessibilityLabel === "阅读工具栏") context.headerStyle = style;
    return React.createElement(
      "div",
      { style, "aria-label": accessibilityLabel },
      children,
    );
  };
  const ScrollView = ({
    children,
    onScroll,
    contentContainerStyle,
  }: PropsWithChildren<{
    onScroll?: (typeof context.scrollHandlers)[number];
    contentContainerStyle?: CSSProperties;
  }>) => {
    if (onScroll) context.scrollHandlers.push(onScroll);
    if (contentContainerStyle)
      context.scrollContentStyles.push(contentContainerStyle);
    return React.createElement("div", null, children);
  };
  return {
    View: element,
    ScrollView,
    Animated: {
      View: element,
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
      accessibilityState,
      style,
      onPress,
    }: PropsWithChildren<{
      accessibilityLabel?: string;
      accessible?: boolean;
      accessibilityState?: { selected?: boolean };
      style?: { minHeight?: number };
      onPress?: () => void;
    }>) => {
      if (accessibilityLabel && onPress)
        context.iconActions.set(accessibilityLabel, onPress);
      if (accessible === false) context.verseMinHeights.push(style?.minHeight);
      return React.createElement(
        "button",
        {
          "aria-label": accessibilityLabel,
          "aria-selected": accessibilityState?.selected,
        },
        children,
      );
    },
    TextInput: () => null,
    useWindowDimensions: () => ({ width: context.width, height: 852 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 59, bottom: 34, left: 0, right: 0 }),
  SafeAreaView: ({
    children,
    edges,
    style,
  }: PropsWithChildren<{
    edges: readonly string[];
    style?: CSSProperties;
  }>) => {
    context.safeAreas.push({ edges, style });
    return React.createElement("div", null, children);
  },
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
  UserRound: () => null,
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
  const Text = ({
    children,
    style,
    numberOfLines,
  }: PropsWithChildren<{
    style?: CSSProperties;
    numberOfLines?: number;
  }>) =>
    React.createElement(
      "span",
      { style, "data-lines": numberOfLines },
      children,
    );
  return {
    Txt: Text,
    Pill: Text,
    Eyebrow: Text,
    Button: ({
      children,
      onPress,
    }: PropsWithChildren<{ onPress: () => void }>) => {
      const label = String(children);
      context.iconActions.set(label, onPress);
      return React.createElement("button", { "aria-label": label }, children);
    },
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
    }: PropsWithChildren<{
      visible: boolean;
      title: string;
    }>) => {
      return visible
        ? React.createElement("section", { "aria-label": title }, children)
        : null;
    },
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
  Tabs: Object.assign(
    (props: PropsWithChildren<{ screenOptions: Record<string, unknown> }>) => {
      context.tabOptions = props.screenOptions;
      React.Children.forEach(props.children, (child) => {
        if (
          React.isValidElement<{
            name: string;
            options?: Record<string, unknown>;
          }>(child)
        )
          context.tabRoutes.set(child.props.name, child.props.options);
      });
      return context.pathname === "/bible"
        ? React.createElement(ReaderScreen)
        : null;
    },
    { Screen: () => null },
  ),
  router: { push: vi.fn(), navigate: vi.fn() },
}));
vi.mock("../src/features/reader/useReadingProgress", () => ({
  useReadingProgress: () => ({
    scrollToVerse: vi.fn(),
    isForeground: () => context.foreground,
    flush: context.flush,
    preservePosition: vi.fn(),
    prepareForViewportShift: context.prepareForViewportShift,
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
vi.mock("../src/features/reader/use-verse-actions-motion", () => ({
  useVerseActionsMotion: (visible: boolean) => ({
    mounted: visible,
    style: {},
  }),
}));
vi.mock("../src/features/reader/reader-input", () => ({
  useChapterKeyboard: () => {},
  hasTextSelection: () => false,
}));
vi.mock("../src/features/reader/VerseText", () => ({
  VerseText: ({
    verse,
    onWord,
    active,
  }: {
    verse: { number: number };
    onWord: (word: string) => void;
    active: boolean;
  }) => {
    context.wordActions.set(verse.number, onWord);
    return React.createElement(
      "p",
      { "data-verse": verse.number, "data-active": active },
      `Verse ${verse.number}`,
    );
  },
}));
vi.mock("../src/features/vocabulary/WordDialog", () => ({
  WordDialog: (props: { selection: unknown; onClose: () => void }) => {
    context.wordDialog = props;
    return null;
  },
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => context.audio,
}));
vi.mock("../src/data/audio-repository", () => ({
  hasChapterAudio: () => false,
  getChapterRecording: () => context.recording,
}));
vi.mock("../src/features/audio/catalog", () => ({
  chapterTracks: () => context.tracks,
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: () => null,
}));
vi.mock("../src/features/audio/PlayerBar", () => ({ PlayerBar: () => null }));
vi.mock("../src/features/audio/NowPlayingButton", () => ({
  NowPlayingButton: ({ scriptureOnly }: { scriptureOnly?: boolean }) =>
    React.createElement("span", {
      "data-now-playing": scriptureOnly ? "scripture" : "all",
    }),
}));
vi.mock("../src/features/vocabulary/VocabularyTabs", () => ({
  VocabularyTabs: () => null,
}));

import { ReaderScreen } from "../src/features/reader/ReaderScreen";
import { ReaderPage } from "../src/features/reader/ReaderPage";
import { ChapterPicker } from "../src/features/reader/ChapterPicker";
import { Shell } from "../src/shared/Shell";
import { ShellActionsContext } from "../src/shared/shell-actions-context";
import { router } from "expo-router";

beforeEach(() => {
  context.cursor = 0;
  context.runEffects = false;
  context.foreground = true;
  context.flush.mockClear();
  context.state.followNarration.mockClear();
  context.cells = [];
  context.audio.repeat = "off";
  context.state.setSelectedVerse.mockImplementation((verse: number) => {
    context.state.selectedVerse = verse;
  });
  context.state.setFollowingNarration.mockImplementation(
    (following: boolean) => {
      context.state.followingNarration = following;
    },
  );
  context.tracks = [];
  context.recording = null;
  context.audio.track = null;
  context.audio.playing = false;
  context.state.followingNarration = false;
  context.state.selectedVerse = 1;
  context.state.readerChromeHidden = false;
  context.state.setReaderChromeHidden.mockImplementation((hidden: boolean) => {
    context.state.readerChromeHidden = hidden;
  });
  context.state.primaryLocale = "en";
  context.state.showTranslation = true;
  context.width = 393;
  context.safeAreas = [];
  context.pathname = "/bible";
  context.wordDialog = null;
  context.scrollHandlers = [];
  context.scrollContentStyles = [];
  context.headerStyle = undefined;
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
  for (const label of [
    "切换内容显示",
    "朗读第 1 节",
    "循环第 1 节",
    "收藏第 1 节",
    "搜索经文",
  ])
    expect(html).toContain(`aria-label="${label}"`);
  expect(html).not.toContain("英文主读");
  for (const y of [0, 90, 35, 0])
    context.scrollHandlers.forEach((handler) =>
      handler({ nativeEvent: { contentOffset: { y } } }),
    );
  expect(context.onScroll).toHaveBeenCalledTimes(4);
  expect(context.state.setReaderChromeHidden).not.toHaveBeenCalled();
});
it("keeps the brand and global actions on other mobile pages", () => {
  context.pathname = "/";
  const html = renderToStaticMarkup(React.createElement(Shell));
  expect(html).toContain("selah");
  expect(html).toContain('aria-label="搜索经文"');
  expect(html).not.toContain('aria-label="设置"');
  expect(html).not.toContain('aria-label="珍藏的经文"');
  expect(html).not.toContain('aria-label="切换为英文"');
});
it.each([393, 1024])(
  "offers the scripture playback entry in the music header at width %s",
  (width) => {
    context.width = width;
    context.pathname = "/music";
    const html = renderToStaticMarkup(React.createElement(Shell));
    expect(html).toContain('data-now-playing="scripture"');
  },
);
it.each([
  "/",
  "/bible",
  "/music",
  "/vocabulary",
  "/review",
  "/settings",
  "/downloads",
])("keeps the bottom safe area inside the mobile tab bar on %s", (pathname) => {
  context.pathname = pathname;
  const html = renderToStaticMarkup(React.createElement(Shell));
  const [shell, tabBar] = context.safeAreas;
  expect(shell.edges).toEqual(["top", "left", "right"]);
  expect(tabBar?.edges).toEqual(["bottom"]);
  expect(tabBar?.style).toMatchObject({
    flexDirection: "row",
    paddingBottom: 0,
  });
  for (const label of ["首页", "圣经", "聆听", "我的"])
    expect(html).toContain(`aria-label="${label}"`);
});
it("keeps bottom safe-area protection on desktop without a mobile tab bar", () => {
  context.width = 1024;
  renderToStaticMarkup(React.createElement(Shell));
  expect(context.safeAreas).toHaveLength(1);
  expect(context.safeAreas[0].edges).toEqual([
    "top",
    "left",
    "right",
    "bottom",
  ]);
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

it.each([320, 393, 768, 1200])(
  "keeps selected-verse controls reachable in the header at %ipx",
  (width) => {
    context.width = width;
    const html = renderToStaticMarkup(React.createElement(ReaderScreen));
    const labels = [
      "选择书卷",
      "选择章节",
      "搜索经文",
      "切换内容显示",
      "朗读第 1 节",
      "循环第 1 节",
      "收藏第 1 节",
      ...(width >= 900 ? ["珍藏的经文"] : []),
    ];
    const positions = labels.map((label) => {
      expect(html.match(new RegExp(`aria-label="${label}"`, "g"))).toHaveLength(
        1,
      );
      return html.indexOf(`aria-label="${label}"`);
    });
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    expect(html.includes('aria-label="selah"')).toBe(width < 900);
    expect(html.includes(">selah<")).toBe(width >= 600 && width < 900);
  },
);

it.each([
  {
    primaryLocale: "zh",
    showTranslation: false,
    label: "中",
    nextLocale: "en",
    nextTranslation: false,
  },
  {
    primaryLocale: "en",
    showTranslation: false,
    label: "英",
    nextLocale: "zh",
    nextTranslation: true,
  },
  {
    primaryLocale: "zh",
    showTranslation: true,
    label: "中英",
    nextLocale: "en",
    nextTranslation: true,
  },
  {
    primaryLocale: "en",
    showTranslation: true,
    label: "英中",
    nextLocale: "zh",
    nextTranslation: false,
  },
])(
  "switches $label to the next content mode without navigating or restarting playback",
  (mode) => {
    context.state.primaryLocale = mode.primaryLocale;
    context.state.showTranslation = mode.showTranslation;
    const html = renderToStaticMarkup(React.createElement(ReaderScreen));
    expect(html).toMatch(
      new RegExp(`aria-label="切换内容显示"[^>]*>[\\s\\S]*?>${mode.label}<`),
    );
    const press = context.iconActions.get("切换内容显示");
    expect(press).toBeDefined();
    press?.();
    expect(context.state.setPrimaryLocale).toHaveBeenCalledWith(
      mode.nextLocale,
    );
    expect(context.state.setShowTranslation).toHaveBeenCalledWith(
      mode.nextTranslation,
    );
    expect(context.state.setChapter).not.toHaveBeenCalled();
    expect(context.state.openReadingPosition).not.toHaveBeenCalled();
    expect(context.state.setSelectedVerse).not.toHaveBeenCalled();
    expect(context.audio.playQueue).not.toHaveBeenCalled();
    expect(context.audio.toggle).not.toHaveBeenCalled();
  },
);

it("opens saved verses and search directly from the desktop reading toolbar", () => {
  context.width = 1200;
  const openSearch = vi.fn(),
    openBookmarks = vi.fn();
  renderToStaticMarkup(
    React.createElement(
      ShellActionsContext.Provider,
      { value: { openSearch, openBookmarks, dialogOpen: false } },
      React.createElement(ReaderScreen),
    ),
  );
  context.iconActions.get("珍藏的经文")?.();
  expect(openBookmarks).toHaveBeenCalledOnce();
  context.iconActions.get("搜索经文")?.();
  expect(openSearch).toHaveBeenCalledOnce();
  expect(context.iconActions.has("设置")).toBe(false);
  expect(router.push).not.toHaveBeenCalled();
});
it("keeps the desktop toolbar focused on the chapter without duplicating the sidebar brand", () => {
  context.width = 1200;
  const html = renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(html).not.toContain("selah");
  expect(html).not.toContain('aria-label="更多"');
  for (const label of ["上一章", "下一章", "搜索经文", "朗读第 1 节"])
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
function tapNarration(label = `朗读第 ${context.state.selectedVerse} 节`) {
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
    tapNarration(playing ? "暂停第 1 节" : "继续朗读第 1 节");
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
  tapNarration("朗读本章");
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 0);
});
it("reports unavailable chapter audio without affecting another recording", () => {
  context.audio.track = { ...recording, chapter: 16 };
  tapNarration();
  expect(context.state.notify).toHaveBeenCalledOnce();
  expect(context.audio.toggle).not.toHaveBeenCalled();
  expect(context.audio.playQueue).not.toHaveBeenCalled();
});

it("lets short verses fit their text instead of reserving a tall blank card", () => {
  renderToStaticMarkup(React.createElement(ReaderScreen));
  const before = [...context.verseMinHeights];
  expect(new Set(before)).toEqual(new Set([undefined]));
  context.state.selectedVerse = 2;
  context.verseMinHeights = [];
  renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(context.verseMinHeights).toEqual(before);
});

function drawReader() {
  context.cursor = 0;
  context.iconActions.clear();
  return renderToStaticMarkup(React.createElement(ReaderScreen));
}
function selectVerse(verse: number) {
  drawReader();
  const press = context.iconActions.get(`选择第 ${verse} 节`);
  expect(press).toBeDefined();
  press?.();
  return drawReader();
}
it("hides both navigation bars on the selected verse and reveals them on any verse", () => {
  expect(selectVerse(2)).toContain('aria-label="选择书卷"');
  expect(selectVerse(2)).not.toContain('aria-label="选择书卷"');
  expect(context.state.readerChromeHidden).toBe(true);
  expect(selectVerse(3)).toContain('aria-label="选择书卷"');
  expect(context.state.selectedVerse).toBe(3);
  expect(context.state.readerChromeHidden).toBe(false);
  expect(selectVerse(2)).toContain('aria-label="选择书卷"');
  expect(context.state.readerChromeHidden).toBe(false);
  context.state.readerChromeHidden = true;
  context.cursor = 0;
  const hidden = renderToStaticMarkup(React.createElement(Shell));
  expect(hidden).not.toContain('aria-label="圣经"');
  expect(hidden).not.toContain('aria-label="选择书卷"');
  expect(context.safeAreas[0]?.edges).not.toContain("bottom");
  expect(context.audio.toggle).not.toHaveBeenCalled();
  expect(context.audio.playQueue).not.toHaveBeenCalled();
});
it("does not hide navigation on other destinations or desktop", () => {
  context.state.readerChromeHidden = true;
  context.pathname = "/music";
  expect(renderToStaticMarkup(React.createElement(Shell))).toContain(
    'aria-label="圣经"',
  );
  context.width = 1024;
  expect(drawReader()).toContain('aria-label="选择书卷"');
});
it("overlays the mobile toolbar and never compensates scroll when toggling it", () => {
  drawReader();
  expect(context.headerStyle).toMatchObject({ position: "absolute", top: 0 });
  const content = context.scrollContentStyles.at(-1);
  expect(selectVerse(1)).not.toContain('aria-label="阅读工具栏"');
  expect(context.scrollContentStyles.at(-1)).toEqual(content);
  expect(selectVerse(1)).toContain('aria-label="阅读工具栏"');
  expect(context.scrollContentStyles.at(-1)).toEqual(content);
  expect(context.prepareForViewportShift).not.toHaveBeenCalled();
});
it("keeps the same mobile safe area and floats the tab bar over the reader", () => {
  context.cells = [];
  context.cursor = 0;
  renderToStaticMarkup(React.createElement(Shell));
  const visibleEdges = context.safeAreas[0].edges;
  expect(context.safeAreas[1].style).toMatchObject({
    position: "absolute",
    bottom: 0,
  });
  context.state.readerChromeHidden = true;
  context.safeAreas = [];
  context.cells = [];
  context.cursor = 0;
  renderToStaticMarkup(React.createElement(Shell));
  expect(context.safeAreas[0].edges).toEqual(visibleEdges);
});
it("selects another verse during repetition without seeking until the toolbar is used", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  context.audio.track = recording;
  context.audio.repeat = "verse";
  selectVerse(2);
  expect(context.state.selectedVerse).toBe(2);
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  context.iconActions.get("朗读第 2 节")?.();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
});
it("keeps playback, repetition and bookmarking in the header with no bottom action card", () => {
  const html = selectVerse(2);
  expect(html).not.toContain('aria-label="经节操作"');
  for (const label of ["朗读第 2 节", "循环第 2 节", "收藏第 2 节"]) {
    expect(html).toContain(`aria-label="${label}"`);
    expect(html.indexOf(`aria-label="${label}"`)).toBeLessThan(
      html.indexOf('data-verse="1"'),
    );
  }
});
it.each([320, 393, 430, 1024])(
  "keeps the full reading width and puts verse actions above the text at %spx",
  (width) => {
    context.width = width;
    const selected = selectVerse(2);
    expect(selected).not.toContain('aria-label="经节操作"');
    for (const label of ["收藏第 2 节", "朗读第 2 节", "循环第 2 节"])
      expect(context.iconActions.has(label)).toBe(true);
    expect(context.iconActions.has("朗读第 1 节")).toBe(false);
    expect(context.audio.playQueue).not.toHaveBeenCalled();
  },
);

it("plays the selected verse from the header", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  selectVerse(2);
  context.iconActions.get("朗读第 2 节")?.();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
});
it.each([true, false])(
  "pauses or resumes the current verse without restarting, playing=%s",
  (playing) => {
    context.tracks = [recording];
    context.audio.track = recording;
    context.audio.playing = playing;
    drawReader();
    context.iconActions.get(playing ? "暂停第 1 节" : "继续朗读第 1 节")?.();
    expect(context.audio.toggle).toHaveBeenCalledOnce();
    expect(context.audio.playQueue).not.toHaveBeenCalled();
  },
);
it("enters and exits repetition without restarting a paused verse", () => {
  context.tracks = [recording];
  context.audio.track = recording;
  context.audio.playing = false;
  drawReader();
  context.iconActions.get("循环第 1 节")?.();
  expect(context.audio.setRepeat).toHaveBeenCalledWith("verse");
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  context.audio.repeat = "verse";
  const html = drawReader();
  expect(html).toContain("退出单节重复");
  context.iconActions.get("退出单节重复")?.();
  expect(context.audio.setRepeat).toHaveBeenLastCalledWith("off");
  expect(context.audio.toggle).not.toHaveBeenCalled();
});
it("switches the repeating verse only when its header repeat action is pressed", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  context.audio.track = recording;
  context.audio.playing = true;
  context.audio.repeat = "verse";
  selectVerse(2);
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  context.iconActions.get("循环第 2 节")?.();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
  expect(context.audio.setRepeat).toHaveBeenCalledWith("verse");
});
it("keeps bookmarks available in the header", () => {
  selectVerse(2);
  context.iconActions.get("收藏第 2 节")?.();
  expect(context.state.toggleBookmark).toHaveBeenCalledWith("1-kings:17:2");
});
it("hides selection actions after moving to another chapter", () => {
  selectVerse(2);
  context.state.chapter = 18;
  expect(drawReader()).not.toContain('aria-label="经节操作"');
  context.state.chapter = 17;
});

it("selects the chapter only after the native pager reports a settled page", () => {
  renderToStaticMarkup(React.createElement(ReaderScreen));
  expect(context.state.openReadingPosition).not.toHaveBeenCalled();
  context.pager?.onSelect({ bookId: "1-kings", chapter: 18 });
  expect(context.state.openReadingPosition).toHaveBeenCalledWith(
    { bookId: "1-kings", chapter: 18, verse: 1, offset: 0 },
    { selectVerse: false },
  );
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

it("labels confirmed missing narration and rejects verse play, loop and chapter fallback", () => {
  context.tracks = [recording, { ...recording, id: "verse-3", verse: 3 }];
  context.recording = {
    path: "/chapter.mp3",
    duration: 20,
    segments: [],
    alignmentStatus: "partial",
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
  };
  const html = selectVerse(2);
  expect(html).toContain("原录音未朗读本节");
  for (const label of ["朗读第 2 节", "循环第 2 节"]) {
    context.iconActions.get(label)?.();
    expect(context.state.notify).toHaveBeenLastCalledWith(
      expect.stringContaining("原录音未朗读本节"),
    );
  }
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  expect(context.audio.setRepeat).not.toHaveBeenCalled();
});
it("keeps other verses playable within a partial chapter", () => {
  context.tracks = [recording, { ...recording, id: "verse-3", verse: 3 }];
  context.recording = {
    path: "/chapter.mp3",
    duration: 20,
    segments: [],
    alignmentStatus: "partial",
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
  };
  selectVerse(3);
  context.iconActions.get("循环第 3 节")?.();
  expect(context.audio.setRepeat).toHaveBeenCalledWith("verse");
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
});

it("retains visited screens and lazily mounts first-level destinations", () => {
  context.tabOptions = null;
  renderToStaticMarkup(React.createElement(Shell));
  expect(context.tabOptions).toMatchObject({
    headerShown: false,
    lazy: true,
    freezeOnBlur: true,
    animation: "none",
  });
});

it("keeps settings and secondary destinations navigable instead of redirecting them as hidden Expo 58 tabs", () => {
  context.tabRoutes.clear();
  renderToStaticMarkup(React.createElement(Shell));
  for (const name of ["settings", "review", "downloads"]) {
    expect(context.tabRoutes.has(name)).toBe(true);
    expect(context.tabRoutes.get(name)?.href).not.toBeNull();
    expect(context.tabRoutes.get(name)?.hidden).not.toBe(true);
  }
});

it("hides and restores the toolbar without stopping or resetting the player", () => {
  context.tracks = [recording];
  context.audio.track = recording;
  context.audio.playing = true;
  expect(selectVerse(1)).not.toContain('aria-label="阅读工具栏"');
  expect(selectVerse(1)).toContain('aria-label="阅读工具栏"');
  expect(context.audio.toggle).not.toHaveBeenCalled();
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  expect(context.audio.setRepeat).not.toHaveBeenCalled();
});

it("switches the repeated target after navigating to another chapter", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  context.audio.track = { ...recording, chapter: 16 };
  context.audio.playing = true;
  context.audio.repeat = "verse";
  selectVerse(2);
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  context.iconActions.get("循环第 2 节")?.();
  expect(context.audio.playQueue).toHaveBeenCalledWith(context.tracks, 1);
  expect(context.audio.setRepeat).toHaveBeenCalledWith("verse");
});
it("keeps a missing selected verse from replacing the active repeat and offers exit on its repeat control", () => {
  context.tracks = [recording];
  context.audio.track = recording;
  context.audio.playing = true;
  context.audio.repeat = "verse";
  context.recording = {
    path: "/chapter.mp3",
    duration: 20,
    segments: [],
    alignmentStatus: "partial",
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
  };
  selectVerse(2);
  expect(context.state.selectedVerse).toBe(2);
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  expect(context.audio.setRepeat).not.toHaveBeenCalled();
  expect(drawReader()).toContain('aria-label="退出单节重复"');
  context.iconActions.get("退出单节重复")?.();
  expect(context.audio.setRepeat).toHaveBeenCalledWith("off");
});

it.each(["off", "verse"] as const)(
  "keeps narration controls coherent before the reading highlight catches up, repeat=%s",
  (repeat) => {
    context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
    context.audio.track = recording;
    context.audio.playing = true;
    context.audio.repeat = repeat;
    drawReader();
    context.state.followingNarration = true;
    context.audio.track = context.tracks[1];
    // Audio publishes the next verse before ReaderPage's effect updates selection.
    expect(context.state.selectedVerse).toBe(1);
    const betweenUpdates = drawReader();
    expect(context.iconActions.has("暂停第 2 节")).toBe(true);
    expect(context.iconActions.has("朗读第 1 节")).toBe(false);
    expect(betweenUpdates).toContain("暂停第 2 节");
    expect(betweenUpdates).not.toContain("播放此节");
    expect(context.iconActions.has("退出单节重复")).toBe(repeat === "verse");
    context.state.selectedVerse = 2;
    const settled = drawReader();
    expect(settled).toBe(betweenUpdates);
  },
);
it("still shows the manually selected verse while another verse keeps playing", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  context.audio.track = recording;
  context.audio.playing = true;
  context.state.followingNarration = true;
  selectVerse(2);
  expect(context.state.followingNarration).toBe(false);
  expect(context.iconActions.has("朗读第 2 节")).toBe(true);
  expect(context.iconActions.has("暂停第 1 节")).toBe(false);
  expect(context.audio.playQueue).not.toHaveBeenCalled();
});

it("highlights the narrated MP3 verse as playback advances after manual selection", () => {
  context.audio.playing = true;
  context.audio.track = { ...recording, id: "verse-2", verse: 2 };
  // Manual selection turns off scrolling with narration, but audio keeps playing.
  context.state.selectedVerse = 1;
  context.state.followingNarration = false;
  let html = drawReader();
  expect(html).toContain('data-verse="1" data-active="true"');
  expect(html).toContain('data-verse="2" data-active="true"');
  context.audio.track = { ...recording, id: "verse-3", verse: 3 };
  html = drawReader();
  expect(html).toContain('data-verse="2" data-active="false"');
  expect(html).toContain('data-verse="3" data-active="true"');
  expect(context.state.selectedVerse).toBe(1);
  expect(context.state.setSelectedVerse).not.toHaveBeenCalled();
  expect(html).not.toContain('aria-label="经节操作"');
});

it("highlights all verses covered by the current recording during verse repeat", () => {
  context.audio.track = {
    ...recording,
    verse: 2,
    coveredVerses: [2, 3],
  };
  context.audio.repeat = "verse";
  context.audio.playing = false;
  const html = drawReader();
  expect(html).toContain('data-verse="2" data-active="true"');
  expect(html).toContain('data-verse="3" data-active="true"');
});

it.each([
  { bookId: "2-kings" },
  { chapter: 18 },
  { locale: "zh" as const },
  { kind: "hymn" as const },
  { verse: undefined },
])(
  "does not highlight a verse for unrelated or unaligned audio: %j",
  (changes) => {
    context.audio.track = { ...recording, verse: 2, ...changes };
    context.audio.playing = true;
    expect(drawReader()).toContain('data-verse="2" data-active="false"');
  },
);

it("keeps chrome hidden as narration starts and advances", () => {
  context.tracks = [recording, { ...recording, id: "verse-2", verse: 2 }];
  tapNarration();
  context.audio.track = recording;
  context.audio.playing = true;
  selectVerse(1);
  expect(drawReader()).not.toContain('aria-label="阅读工具栏"');
  context.audio.track = context.tracks[1];
  expect(drawReader()).not.toContain('aria-label="阅读工具栏"');
});
it.each([true, false])(
  "allows hiding and restoring the toolbar during repeat without changing playback, playing=%s",
  (playing) => {
    context.tracks = [recording];
    context.audio.track = recording;
    context.audio.playing = playing;
    context.audio.repeat = "verse";
    expect(selectVerse(1)).not.toContain('aria-label="阅读工具栏"');
    expect(selectVerse(1)).toContain('aria-label="退出单节重复"');
    expect(context.audio.playQueue).not.toHaveBeenCalled();
    expect(context.audio.toggle).not.toHaveBeenCalled();
  },
);

it("opens word lookup without selecting a verse or changing the repeat target", () => {
  context.tracks = [recording];
  context.audio.track = recording;
  context.audio.playing = true;
  context.audio.repeat = "verse";
  drawReader();
  context.wordActions.get(2)?.("lord");
  expect(context.state.setSelectedVerse).not.toHaveBeenCalled();
  expect(context.audio.playQueue).not.toHaveBeenCalled();
  expect(context.audio.setRepeat).not.toHaveBeenCalled();
  expect(drawReader()).toContain("暂停第 1 节");
});
it("can hide the bar again after exiting repeat", () => {
  context.tracks = [recording];
  context.audio.track = recording;
  context.audio.repeat = "verse";
  selectVerse(1);
  context.audio.repeat = "off";
  expect(selectVerse(1)).not.toContain('aria-label="经节操作"');
});

it.each([
  { bookId: "1-kings", chapter: 18, verse: 1 },
  { bookId: "2-kings", chapter: 1, verse: 3 },
  { bookId: "1-kings", chapter: 18, verse: undefined },
])(
  "moves the foreground reader with narration across chapters: $bookId $chapter",
  (target) => {
    context.runEffects = true;
    context.state.followingNarration = true;
    context.audio.playing = true;
    context.audio.track = {
      id: "next-chapter",
      kind: "scripture",
      title: "",
      subtitle: "",
      artwork: 1,
      source: { uri: "/next.mp3" },
      ...target,
    };
    renderToStaticMarkup(
      React.createElement(ReaderPage, {
        bookId: "1-kings",
        chapter: 17,
        current: true,
        onWord: vi.fn(),
        onSelectVerse: vi.fn(),
      }),
    );
    expect(context.flush).toHaveBeenCalledOnce();
    expect(context.state.followNarration).toHaveBeenCalledExactlyOnceWith(
      target.bookId,
      target.chapter,
      target.verse ?? 1,
    );
    expect(context.flush.mock.invocationCallOrder[0]).toBeLessThan(
      context.state.followNarration.mock.invocationCallOrder[0],
    );
  },
);

it.each([
  { following: false, foreground: true, current: true, playing: true },
  { following: true, foreground: false, current: true, playing: true },
  { following: true, foreground: true, current: false, playing: true },
  { following: true, foreground: true, current: true, playing: false },
])("keeps reading position when chapter following is inactive: %j", (state) => {
  context.runEffects = true;
  context.foreground = state.foreground;
  context.state.followingNarration = state.following;
  context.audio.playing = state.playing;
  context.audio.track = {
    id: "next-chapter",
    kind: "scripture",
    title: "",
    subtitle: "",
    artwork: 1,
    source: { uri: "/next.mp3" },
    bookId: "1-kings",
    chapter: 18,
    verse: 1,
  };
  renderToStaticMarkup(
    React.createElement(ReaderPage, {
      bookId: "1-kings",
      chapter: 17,
      current: state.current,
      onWord: vi.fn(),
      onSelectVerse: vi.fn(),
    }),
  );
  expect(context.state.followNarration).not.toHaveBeenCalled();
});

it.each(["/me", "/vocabulary", "/review", "/downloads", "/settings", "/about"])(
  "groups %s under My and lets the tab return to its hub",
  (pathname) => {
    context.pathname = pathname;
    const html = renderToStaticMarkup(React.createElement(Shell));
    expect(html).toContain('aria-label="我的" aria-selected="true"');
    expect(html).not.toContain('aria-label="词汇"');
    context.iconActions.get("我的")?.();
    if (pathname !== "/me") expect(router.navigate).toHaveBeenCalledWith("/me");
    expect(context.tabRoutes.has("me")).toBe(true);
    expect(context.tabRoutes.has("about")).toBe(true);
  },
);

it.each([320, 393, 768, 1200])(
  "opens search directly as the first toolbar action without settings or more at %spx",
  (width) => {
    context.width = width;
    let dialogOpen = false;
    const openSearch = vi.fn(() => {
      dialogOpen = true;
    });
    const openBookmarks = vi.fn();
    function render() {
      context.cursor = 0;
      context.iconActions.clear();
      return renderToStaticMarkup(
        React.createElement(
          ShellActionsContext.Provider,
          { value: { openSearch, openBookmarks, dialogOpen } },
          React.createElement(ReaderScreen),
        ),
      );
    }
    const html = render();
    expect(html).toContain('aria-label="搜索经文"');
    expect(html.indexOf('aria-label="搜索经文"')).toBeLessThan(
      html.indexOf('aria-label="切换内容显示"'),
    );
    expect(html).not.toContain('aria-label="设置"');
    expect(html).not.toContain('aria-label="更多阅读工具"');
    context.iconActions.get("搜索经文")!();
    expect(openSearch).toHaveBeenCalledOnce();
    expect(context.flush.mock.invocationCallOrder[0]).toBeLessThan(
      openSearch.mock.invocationCallOrder[0],
    );
    render();
    expect(context.pager?.enabled).toBe(false);
    dialogOpen = false;
    render();
    expect(context.pager?.enabled).toBe(true);
    expect(context.audio.playQueue).not.toHaveBeenCalled();
    expect(router.push).not.toHaveBeenCalled();
  },
);
it.each([true, false])(
  "keeps chrome, selection and playback unchanged while opening and closing word lookup, hidden=%s",
  (hidden) => {
    context.state.readerChromeHidden = hidden;
    context.state.selectedVerse = 3;
    drawReader();
    context.wordActions.get(2)?.("lord");
    drawReader();
    expect(context.wordDialog?.selection).toMatchObject({
      word: "lord",
      reference: "1 Kings 17:2",
    });
    context.wordDialog?.onClose();
    drawReader();
    expect(context.wordDialog?.selection).toBeNull();
    expect(context.state.selectedVerse).toBe(3);
    expect(context.state.readerChromeHidden).toBe(hidden);
    expect(context.state.setReaderChromeHidden).not.toHaveBeenCalled();
    expect(context.audio.playQueue).not.toHaveBeenCalled();
  },
);
