import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { bibleRepository } from "../src/data/bible-repository";
import { DailyVerseCard } from "../src/features/daily-verse/DailyVerseCard";
import type {
  DailyVerseEntry,
  DailyVerseImage,
} from "@selah/content/daily-verses";

const context = vi.hoisted(() => ({
  locale: "en" as "en" | "zh",
  bookmarks: [] as string[],
  actions: [] as { label?: string; onPress: () => void }[],
  toggleBookmark: vi.fn(),
  setChapter: vi.fn(),
}));
vi.mock("react-native", () => ({
  View: ({ children }: React.PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: React.PropsWithChildren<{
    accessibilityLabel?: string;
    onPress: () => void;
  }>) => {
    context.actions.push({ label: accessibilityLabel, onPress });
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel },
      children,
    );
  },
  Image: () => null,
  useWindowDimensions: () => ({ width: 393, height: 852 }),
}));
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: React.PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("../src/shared/ui", () => {
  const Text = ({ children }: React.PropsWithChildren) =>
    React.createElement("span", null, children);
  return {
    Txt: Text,
    Eyebrow: Text,
    Panel: Text,
    Button: Text,
    IconButton: ({ label }: { label: string }) =>
      React.createElement("button", { "aria-label": label }),
  };
});
vi.mock("lucide-react-native", () => ({
  ArrowUpRight: () => null,
  ArrowRight: () => null,
  Sprout: () => null,
  Play: () => null,
  Quote: () => null,
  Bookmark: () => null,
  History: () => null,
  Share2: () => null,
}));
vi.mock("react-native-svg", () => ({
  default: () => null,
  Circle: () => null,
}));
vi.mock("expo-linking", () => ({ openURL: vi.fn() }));
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13, body: 14 },
  images: {},
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({
    locale: context.locale,
    bi: (zh: string, en: string) => (context.locale === "zh" ? zh : en),
  }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(
    (select: (state: object) => unknown) =>
      select({
        words: [],
        reviews: [],
        dailyGoal: 10,
        bookmarks: context.bookmarks,
      }),
    {
      getState: () => ({
        toggleBookmark: context.toggleBookmark,
        setChapter: context.setChapter,
      }),
    },
  ),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ playQueue: vi.fn() }),
}));
vi.mock("../src/features/audio/catalog", () => ({ hymns: () => [] }));
vi.mock("../src/features/audio/useHymns", () => ({ useHymns: () => [] }));

const entry: DailyVerseEntry = {
  id: "daily-2026-11-02",
  date: "2026-11-02",
  reference: { bookId: "john", chapter: 8, verse: 12 },
  imageId: "image",
  theme: "light",
  status: "approved",
};
const image: DailyVerseImage = {
  id: "image",
  file: "image.jpg",
  sha256: "image",
  author: "Photographer",
  sourceUrl: "https://example.org/photo",
  license: "CC0",
  licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
  width: 1200,
  height: 800,
  theme: "light",
};
const renderCard = (dailyEntry = entry, stale = false, onShare = vi.fn()) =>
  renderToStaticMarkup(
    React.createElement(DailyVerseCard, {
      entry: dailyEntry,
      image,
      imageUri: "file:///daily.jpg",
      stale,
      onShare,
    }),
  );

beforeEach(() => {
  context.actions = [];
  vi.clearAllMocks();
});

it.each(["en", "zh"] as const)(
  "shows both complete scripture texts in the %s home card",
  (locale) => {
    context.locale = locale;
    const verse = bibleRepository
      .getChapter("john", 8)
      .find((verse) => verse.number === 12)!;
    const html = renderCard();
    expect(html).toContain(verse.zh);
    expect(html).toContain(verse.en);
    expect(html.indexOf(verse[locale])).toBeLessThan(
      html.indexOf(verse[locale === "en" ? "zh" : "en"]),
    );
  },
);

it.each(["en", "zh"] as const)(
  "names the dated passage daily in %s",
  (locale) => {
    context.locale = locale;
    const html = renderCard();
    expect(html).toContain(locale === "zh" ? "每日经文" : "Daily Scripture");
    expect(html).toContain(
      locale === "zh" ? "收藏每日经文" : "Save daily Scripture",
    );
  },
);

it.each(["en", "zh"] as const)(
  "simplifies nested opening quotes in the %s card and its share image without changing scripture",
  (locale) => {
    context.locale = locale;
    const dailyEntry = {
      ...entry,
      reference: { bookId: "numbers", chapter: 6, verse: 24 },
    };
    const verse = bibleRepository
      .getChapter("numbers", 6)
      .find((verse) => verse.number === 24)!;
    const sourceText = "“ ‘ “The LORD bless you and keep you;";
    const displayText = "“The LORD bless you and keep you;";
    expect(verse.en).toBe(sourceText);
    const onShare = vi.fn();
    const html = renderCard(dailyEntry, false, onShare);
    expect(html).toContain(displayText);
    expect(html).not.toContain(sourceText);
    expect(html).toContain(verse.zh);
    context.actions
      .find(
        (action) =>
          action.label ===
          (locale === "zh" ? "分享经文图片" : "Share Scripture image"),
      )!
      .onPress();
    expect(onShare).toHaveBeenCalledWith(
      expect.objectContaining({
        primaryText: locale === "en" ? displayText : verse.zh,
        secondaryText: locale === "en" ? verse.zh : displayText,
      }),
    );
    expect(verse.en).toBe(sourceText);
  },
);

it("labels a saved daily verse as removable and toggles that same passage", () => {
  context.locale = "zh";
  context.bookmarks = ["john:8:12"];
  const html = renderCard();
  expect(html).toContain("取消收藏每日经文");
  context.actions
    .find((action) => action.label === "取消收藏每日经文")!
    .onPress();
  expect(context.toggleBookmark).toHaveBeenCalledWith("john:8:12");
  context.bookmarks = [];
});

it("opens the full chapter at the daily passage when its reference is pressed", async () => {
  renderCard();
  context.actions
    .find(
      (action) =>
        action.label?.startsWith("阅读") || action.label?.startsWith("Read "),
    )!
    .onPress();
  expect(context.setChapter).toHaveBeenCalledWith("john", 8, 12);
  const { router } = await import("expo-router");
  expect(router.push).toHaveBeenCalledWith("/bible");
});

it("changes both full texts and bookmark target with the scheduled reference", () => {
  context.locale = "zh";
  const next = {
    ...entry,
    date: "2026-11-03",
    reference: { bookId: "psalms", chapter: 23, verse: 1, endVerse: 2 },
  };
  const html = renderCard(next);
  const verses = bibleRepository.getChapter("psalms", 23).slice(0, 2);
  for (const verse of verses) {
    expect(html).toContain(verse.en);
    expect(html).toContain(verse.zh);
  }
  context.actions.find((action) => action.label === "收藏每日经文")!.onPress();
  expect(context.toggleBookmark.mock.calls).toEqual([
    ["psalms:23:1"],
    ["psalms:23:2"],
  ]);
});
it("marks dated fallback content explicitly and shares the displayed complete passage", () => {
  context.locale = "zh";
  const onShare = vi.fn();
  const html = renderCard(entry, true, onShare);
  expect(html).toContain("最近经文");
  expect(html).toContain("今日内容暂不可用");
  context.actions.find((action) => action.label === "分享经文图片")!.onPress();
  expect(onShare).toHaveBeenCalledWith(
    expect.objectContaining({
      date: entry.date,
      reference: "约翰福音 8:12",
      primaryText: bibleRepository
        .getChapter("john", 8)
        .find((v) => v.number === 12)!.zh,
      imageUri: "file:///daily.jpg",
    }),
  );
});
