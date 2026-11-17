import { expect, it, vi } from "vitest";

// Image assets are unrelated to the typography contract under test.
vi.mock("../src/shared/theme", async () => {
  return {
    fonts: {
      scriptureZh: "SelahScriptureSC_400Regular",
      scriptureEn: "SourceSerif4_400Regular",
    },
  };
});
import { themes } from "../src/shared/theme-palettes";
const colors = themes.olive.colors;
import { baseVerseTextStyle } from "../src/features/reader/verse-text-style.shared";

function contrast(foreground: string, background: string) {
  const luminance = (hex: string) => {
    const channels = hex.match(/[a-f\d]{2}/gi)!.map((channel) => {
      const value = parseInt(channel, 16) / 255;
      return value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4;
    });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  return (luminance(background) + 0.05) / (luminance(foreground) + 0.05);
}

it("keeps primary scripture in a consistent warm ink when selected or playing", () => {
  for (const language of ["zh", "en"] as const) {
    const normal = baseVerseTextStyle(language, false, 18, 1.6);
    const active = baseVerseTextStyle(language, false, 18, 1.6, true);
    expect(normal.color).toBe(language === "en" ? "#494A45" : "#353832");
    expect(active.color).toBe(normal.color);
    expect(contrast(normal.color, colors.background)).toBeGreaterThanOrEqual(7);
    expect(contrast(active.color, colors.readingActive)).toBeGreaterThanOrEqual(
      7,
    );
  }
});

it("keeps translations and verse numbers readable on both reading surfaces", () => {
  for (const background of [colors.background, colors.readingActive]) {
    expect(
      contrast(colors.readingSecondary, background),
    ).toBeGreaterThanOrEqual(4.5);
    expect(contrast(colors.readingNumber, background)).toBeGreaterThanOrEqual(
      4.5,
    );
  }
  expect(baseVerseTextStyle("zh", false, 18, 1.6).letterSpacing).toBe(0);
});

it("uses a neutral warm grey for English translations with readable contrast", () => {
  const style = baseVerseTextStyle("en", true, 18, 1.6);
  expect(style.fontFamily).toBe("Lora_400Regular");
  expect(style.color).toBe("#6A6B65");
  for (const background of [colors.background, colors.readingActive]) {
    expect(contrast(style.color, background)).toBeGreaterThanOrEqual(4.5);
  }
});
