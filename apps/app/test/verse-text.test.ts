import React, { type PropsWithChildren, type CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const interactions = vi.hoisted(() => ({
  words: new Map<
    string,
    {
      onPress?: (event: { stopPropagation: () => void }) => void;
      onLongPress?: (event: { stopPropagation: () => void }) => void;
      onPressIn?: () => void;
    }
  >(),
}));
beforeEach(() => {
  interactions.words.clear();
  vi.clearAllMocks();
});
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Text: ({
    children,
    style,
    onPress,
    onLongPress,
    onPressIn,
  }: PropsWithChildren<{
    style: CSSProperties;
    onPress?: () => void;
    onLongPress?: () => void;
    onPressIn?: () => void;
  }>) => {
    if (typeof children === "string")
      interactions.words.set(children, { onPress, onLongPress, onPressIn });
    return React.createElement(
      "span",
      { style, "data-tappable": !!onPress },
      children,
    );
  },
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children, style }: PropsWithChildren<{ style: CSSProperties }>) =>
    React.createElement("span", { style }, children),
}));
vi.mock("../src/shared/theme", () => ({
  colors: { ink: "#2D352A", green: "#4C6244", muted: "#818378" },
  fonts: {
    serif: "serif",
    regular: "sans-serif",
    italic: "serif",
    scriptureEn: "serif",
    scriptureZh: "cjk-serif",
  },
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

it("renders the chosen fonts for both primary and translated scripture", () => {
  const html = renderToStaticMarkup(
    React.createElement(VerseText, {
      ...props,
      readingFonts: { zh: "noto-sans-sc", en: "dm-sans" },
    }),
  );
  expect(html).toContain("font-family:SelahSansSC_400Regular");
  expect(html).toContain("font-family:DMSans_400Regular");
  expect(html.replace(/<[^>]*>/g, "")).toContain(verse.en);
  expect(html.replace(/<[^>]*>/g, "")).toContain(verse.zh);
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

it("uses a chapter's shared vocabulary index for learned-word highlighting", () => {
  const html = renderToStaticMarkup(
    React.createElement(VerseText, {
      ...props,
      knownWords: new Set(["shepherd"]),
    }),
  );
  expect(html).toContain("text-decoration-line:underline");
  expect(html).toContain("color:#4C6244");
});

it.each(["en", "zh"] as const)(
  "puts one inline superscript before the %s primary text",
  (primaryLocale) => {
    const html = renderToStaticMarkup(
      React.createElement(VerseText, {
        ...props,
        primaryLocale,
        showVerseNumber: true,
      }),
    );
    const text = html.replace(/<[^>]*>/g, "");
    expect(text.startsWith(`¹ ${verse[primaryLocale]}`)).toBe(true);
    expect(text.match(/¹/g)).toHaveLength(1);
  },
);
it("supports three-digit inline verse numbers", () => {
  const html = renderToStaticMarkup(
    React.createElement(VerseText, {
      ...props,
      verse: { ...verse, number: 119 },
      showVerseNumber: true,
    }),
  );
  expect(html.replace(/<[^>]*>/g, "")).toContain("¹¹⁹ ");
});

it("selects the verse on a short word tap and looks up only on long press", () => {
  const onVersePress = vi.fn();
  renderToStaticMarkup(
    React.createElement(VerseText, { ...props, onVersePress }),
  );
  const shepherd = interactions.words.get("shepherd");
  const event = { stopPropagation: vi.fn() };
  shepherd?.onPress?.(event);
  expect(onVersePress).toHaveBeenCalledOnce();
  expect(props.onWord).not.toHaveBeenCalled();
  expect(event.stopPropagation).toHaveBeenCalledOnce();
  shepherd?.onLongPress?.(event);
  expect(props.onWord).toHaveBeenCalledWith("shepherd");
  expect(onVersePress).toHaveBeenCalledOnce();
  expect(event.stopPropagation).toHaveBeenCalledTimes(2);
});
it("does not install long-press lookup on preloaded chapter text", () => {
  renderToStaticMarkup(
    React.createElement(VerseText, {
      ...props,
      interactive: false,
      knownWords: new Set(["shepherd"]),
    }),
  );
  expect(interactions.words.get("shepherd")?.onLongPress).toBeUndefined();
});
it("does not select or toggle navigation when a held word is released, and accepts the next tap", () => {
  const onVersePress = vi.fn();
  renderToStaticMarkup(
    React.createElement(VerseText, { ...props, onVersePress }),
  );
  const word = interactions.words.get("shepherd");
  const event = { stopPropagation: vi.fn() };
  word?.onPressIn?.();
  word?.onLongPress?.(event);
  word?.onPress?.(event);
  expect(props.onWord).toHaveBeenCalledExactlyOnceWith("shepherd");
  expect(onVersePress).not.toHaveBeenCalled();
  word?.onPressIn?.();
  word?.onPress?.(event);
  expect(onVersePress).toHaveBeenCalledOnce();
});
