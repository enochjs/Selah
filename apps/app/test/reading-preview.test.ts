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
  typeScale: { caption: 12 },
  colors: {
    ink: "#2D352A",
    green: "#4C6244",
    muted: "#666D60",
    secondaryText: "#697360",
  },
  fonts: {
    scriptureEn: "serif",
    scriptureZh: "serif",
  },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
const settings = vi.hoisted(() => ({
  primaryLocale: "en" as "en" | "zh",
  showTranslation: true,
  fontSize: 20,
  lineHeight: 1.8,
  readingFonts: { zh: "noto-serif-sc", en: "source-serif-4" },
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: typeof settings) => unknown) =>
    select(settings),
}));
import { ReadingPreview } from "../src/features/settings/ReadingPreview";
import { bibleRepository } from "../src/data/bible-repository";
const verse = bibleRepository
  .getChapter("psalms", 23)
  .find((item) => item.number === 1)!;
it.each(["en", "zh"] as const)(
  "previews the complete %s passage first with translation",
  (locale) => {
    settings.primaryLocale = locale;
    settings.showTranslation = true;
    const html = renderToStaticMarkup(React.createElement(ReadingPreview));
    const text = html.replace(/<[^>]*>/g, "");
    expect(text.indexOf(verse[locale])).toBeGreaterThan(-1);
    expect(text.indexOf(verse[locale])).toBeLessThan(
      text.indexOf(verse[locale === "en" ? "zh" : "en"]),
    );
    expect(text).toContain("23:1");
  },
);
it.each(["en", "zh"] as const)("hides secondary text for %s", (locale) => {
  settings.primaryLocale = locale;
  settings.showTranslation = false;
  const html = renderToStaticMarkup(React.createElement(ReadingPreview));
  expect(html).toContain(verse[locale]);
  expect(html).not.toContain(verse[locale === "en" ? "zh" : "en"]);
});

it("previews each language in its selected font", () => {
  settings.showTranslation = true;
  settings.readingFonts = { zh: "lxgw-wenkai", en: "lora" };
  const html = renderToStaticMarkup(React.createElement(ReadingPreview));
  expect(html).toContain("font-family:SelahWenKai_400Regular");
  expect(html).toContain("font-family:Lora_400Regular");
});
it.each([
  [16, 1.4],
  [20, 1.6],
  [26, 1.8],
])("responds to text size %s and line height %s", (fontSize, lineHeight) => {
  settings.fontSize = fontSize;
  settings.lineHeight = lineHeight;
  settings.showTranslation = true;
  const html = renderToStaticMarkup(React.createElement(ReadingPreview));
  expect(html).toContain(`font-size:${fontSize}px`);
  expect(html).toContain(`line-height:${fontSize * lineHeight}`);
  expect(html).toContain("color:#2D352A");
  expect(html).toContain("color:#697360");
  expect(html).toContain(
    `font-size:${Math.max(13, Math.round(fontSize * 0.78))}px`,
  );
});
