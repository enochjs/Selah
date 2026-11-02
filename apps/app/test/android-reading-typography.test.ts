import { expect, it, vi } from "vitest";

vi.mock("../src/shared/theme", () => ({
  colors: { ink: "#2D352A", secondaryText: "#697360" },
  fonts: {
    scriptureEn: "SourceSerif4_400Regular",
    scriptureZh: "SelahScriptureSC_400Regular",
  },
}));
import { verseTextStyle as standardStyle } from "../src/features/reader/verse-text-style";
import { verseTextStyle as androidStyle } from "../src/features/reader/verse-text-style.android";

it("makes Android English text slightly smaller and reduces excess line spacing", () => {
  const style = androidStyle("en", false, 18, 1.6);
  expect(style.fontSize).toBe(17);
  expect(style.lineHeight).toBeCloseTo(26.35);
  expect(style.includeFontPadding).toBe(false);
  expect(style.fontFamily).toBe(standardStyle("en", false, 18, 1.6).fontFamily);
});

it("preserves the existing iOS and web reading metrics", () => {
  const style = standardStyle("en", false, 18, 1.6);
  expect(style.fontSize).toBe(18);
  expect(style.lineHeight).toBeCloseTo(28.8);
  expect(style).not.toHaveProperty("includeFontPadding");
});

it("keeps Chinese text at the requested size while removing Android font padding", () => {
  const style = androidStyle("zh", false, 18, 1.6);
  const standard = standardStyle("zh", false, 18, 1.6);
  expect(style).toEqual({ ...standard, includeFontPadding: false });
});

it("keeps translation text legible and smaller than the primary English text", () => {
  for (const size of [16, 18, 20, 23, 26]) {
    const primary = androidStyle("en", false, size, 1.6);
    const secondary = androidStyle("en", true, size, 1.6);
    expect(secondary.fontSize).toBeGreaterThanOrEqual(13);
    expect(secondary.fontSize).toBeLessThan(primary.fontSize);
  }
});

it("preserves the order and usefulness of text size and line spacing settings", () => {
  const sizes = [16, 18, 20, 23, 26].map(
    (size) => androidStyle("en", false, size, 1.6).fontSize,
  );
  expect(sizes).toEqual([15, 17, 19, 21.5, 24.5]);
  const heights = [1.4, 1.6, 1.8].map(
    (spacing) => androidStyle("en", false, 18, spacing).lineHeight,
  );
  expect(heights[0]).toBeGreaterThanOrEqual(17 * 1.4);
  expect(heights[0]).toBeLessThan(heights[1]);
  expect(heights[1]).toBeLessThan(heights[2]);
});

it("retains selected fonts, translation color and playback highlighting", () => {
  const fonts = { zh: "lxgw-wenkai", en: "lora" } as const;
  for (const language of ["en", "zh"] as const) {
    for (const secondary of [false, true]) {
      const standard = standardStyle(language, secondary, 18, 1.6, true, fonts);
      const android = androidStyle(language, secondary, 18, 1.6, true, fonts);
      expect(android.fontFamily).toBe(standard.fontFamily);
      expect(android.color).toBe(standard.color);
      expect(android.letterSpacing).toBe(standard.letterSpacing);
    }
  }
});
