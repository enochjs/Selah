import React, { type PropsWithChildren, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Text: ({
    children,
    style,
    onPress,
  }: PropsWithChildren<{ style: CSSProperties; onPress?: () => void }>) =>
    React.createElement(
      "span",
      { style, "data-tappable": !!onPress },
      children,
    ),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children, style }: PropsWithChildren<{ style: CSSProperties }>) =>
    React.createElement("span", { style }, children),
}));
vi.mock("../src/shared/theme", () => ({
  colors: { ink: "#2D352A", green: "#4C6244", muted: "#818378" },
  fonts: { serif: "serif", regular: "sans-serif", italic: "serif" },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
import { VerseText } from "../src/features/reader/VerseText";
import { createWord } from "../src/domain/vocabulary";

const verse = {
  number: 1,
  en: "The LORD is my shepherd.",
  zh: "耶和华是我的牧者。",
};
const props = {
  verse,
  chapter: 23,
  primaryLocale: "en" as const,
  showTranslation: true,
  fontSize: 20,
  lineHeight: 1.8,
  active: true,
  words: [],
  onWord: vi.fn(),
};

it("inherits paragraph typography instead of rebuilding font spans for every word and space", () => {
  const html = renderToStaticMarkup(React.createElement(VerseText, props));
  expect(html.match(/font-family:serif/g)).toHaveLength(1);
  expect(html.replace(/<[^>]*>/g, "")).toContain(verse.en);
});

it("preloads the same text without creating per-word tap targets until the page is active", () => {
  const preview = renderToStaticMarkup(
    React.createElement(VerseText, { ...props, interactive: false }),
  );
  const active = renderToStaticMarkup(
    React.createElement(VerseText, { ...props, interactive: true }),
  );
  expect(preview).not.toContain('data-tappable="true"');
  expect(active).toContain('data-tappable="true"');
  expect(preview.match(/<span/g)).toHaveLength(2);
  expect(preview.replace(/<[^>]*>/g, "")).toBe(active.replace(/<[^>]*>/g, ""));
});

it("preserves learned-word color and underlining in a non-interactive preloaded page", () => {
  const html = renderToStaticMarkup(
    React.createElement(VerseText, {
      ...props,
      interactive: false,
      words: [createWord("shepherd", "牧者", "Psalms 23:1", verse.en)],
    }),
  );
  expect(html).toContain("text-decoration-line:underline");
  expect(html).toContain("color:#4C6244");
  expect(html).not.toContain('data-tappable="true"');
  expect(html.replace(/<[^>]*>/g, "")).toContain(verse.en);
});

it.each(["en", "zh"] as const)(
  "places %s first with larger type and retains the translation",
  (primaryLocale) => {
    const html = renderToStaticMarkup(
      React.createElement(VerseText, { ...props, primaryLocale }),
    );
    const text = html.replace(/<[^>]*>/g, "");
    expect(text.indexOf(verse[primaryLocale])).toBeLessThan(
      text.indexOf(verse[primaryLocale === "zh" ? "en" : "zh"]),
    );
    expect(html).toContain("font-size:20px");
    expect(html).toContain("line-height:36");
  },
);

it.each(["en", "zh"] as const)(
  "shows only the %s primary text when translation is hidden",
  (primaryLocale) => {
    const html = renderToStaticMarkup(
      React.createElement(VerseText, {
        ...props,
        primaryLocale,
        showTranslation: false,
      }),
    );
    const text = html.replace(/<[^>]*>/g, "");
    expect(text).toContain(verse[primaryLocale]);
    expect(text).not.toContain(verse[primaryLocale === "zh" ? "en" : "zh"]);
  },
);
