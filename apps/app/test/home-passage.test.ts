import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { bibleRepository } from "../src/data/bible-repository";
import { HomeHighlights } from "../src/features/home/HomeHighlights";

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
}));
vi.mock("react-native-svg", () => ({
  default: () => null,
  Circle: () => null,
}));
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
    const html = renderToStaticMarkup(React.createElement(HomeHighlights));
    expect(html).toContain(verse.zh);
    expect(html).toContain(verse.en);
    expect(html.indexOf(verse[locale])).toBeLessThan(
      html.indexOf(verse[locale === "en" ? "zh" : "en"]),
    );
  },
);

it.each(["en", "zh"] as const)(
  "names the fixed passage featured rather than daily in %s",
  (locale) => {
    context.locale = locale;
    const html = renderToStaticMarkup(React.createElement(HomeHighlights));
    expect(html).toContain(locale === "zh" ? "精选经文" : "Featured verse");
    expect(html).toContain(
      locale === "zh" ? "收藏精选经文" : "Save featured verse",
    );
  },
);

it("labels a saved featured verse as removable and toggles that same passage", () => {
  context.locale = "zh";
  context.bookmarks = ["john:8:12"];
  const html = renderToStaticMarkup(React.createElement(HomeHighlights));
  expect(html).toContain("取消收藏精选经文");
  context.actions
    .find((action) => action.label === "取消收藏精选经文")!
    .onPress();
  expect(context.toggleBookmark).toHaveBeenCalledWith("john:8:12");
  context.bookmarks = [];
});

it("opens the full chapter at the featured passage when its reference is pressed", async () => {
  renderToStaticMarkup(React.createElement(HomeHighlights));
  context.actions.find((action) => !action.label)!.onPress();
  expect(context.setChapter).toHaveBeenCalledWith("john", 8, 12);
  const { router } = await import("expo-router");
  expect(router.push).toHaveBeenCalledWith("/bible");
});
