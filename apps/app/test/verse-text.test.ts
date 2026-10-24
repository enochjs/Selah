import React, { type PropsWithChildren, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
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
