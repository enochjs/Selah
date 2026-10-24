import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { bibleRepository } from "../src/data/bible-repository";
import { HomeHighlights } from "../src/features/home/HomeHighlights";

const context = vi.hoisted(() => ({ locale: "en" as "en" | "zh" }));
vi.mock("react-native", () => ({
  View: ({ children }: React.PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: ({ children }: React.PropsWithChildren) =>
    React.createElement("button", null, children),
  Image: () => null,
  useWindowDimensions: () => ({ width: 393, height: 852 }),
}));
vi.mock("../src/shared/ui", () => {
  const Text = ({ children }: React.PropsWithChildren) =>
    React.createElement("span", null, children);
  return {
    Txt: Text,
    Eyebrow: Text,
    Panel: Text,
    Button: Text,
    IconButton: () => null,
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
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {}, images: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({
    locale: context.locale,
    bi: (zh: string, en: string) => (context.locale === "zh" ? zh : en),
  }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: object) => unknown) =>
    select({ words: [], reviews: [], dailyGoal: 10, bookmarks: [] }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ playQueue: vi.fn() }),
}));
vi.mock("../src/features/audio/catalog", () => ({ hymns: () => [] }));

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
