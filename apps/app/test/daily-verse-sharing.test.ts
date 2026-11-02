import { describe, expect, it } from "vitest";
import {
  layoutShareText,
  layoutShareAttribution,
  wrapShareText,
  estimateShareText,
  type DailyVerseSharePayload,
} from "../src/domain/daily-verse-sharing";
const payload: DailyVerseSharePayload = {
  date: "2026-11-02",
  reference: "诗篇 119:105",
  primaryText: "你的话是我脚前的灯，是我路上的光。",
  secondaryText: "Your word is a lamp for my feet, a light on my path.",
  primaryLocale: "zh",
  imageUri: "",
  imageAuthor: "Photographer",
  imageSourceUrl: "",
  imageLicense: "CC BY 4.0",
  imageLicenseUrl: "",
};
describe("daily verse image layout", () => {
  it("preserves long bilingual scripture and keeps every line within the artwork", () => {
    for (const format of ["square", "portrait"] as const) {
      const long = {
        ...payload,
        primaryText: payload.primaryText.repeat(18),
        secondaryText: payload.secondaryText.repeat(18),
      };
      const layout = layoutShareText(long, format);
      for (const [index, block] of layout.blocks.entries()) {
        expect(block.lines.join("").replace(/\s/g, "")).toBe(
          (index === 0 ? long.primaryText : long.secondaryText).replace(
            /\s/g,
            "",
          ),
        );
        expect(block.y).toBeGreaterThan(190);
        expect(block.y + block.lines.length * block.lineHeight).toBeLessThan(
          layout.height - 180,
        );
        for (const line of block.lines)
          expect(estimateShareText(line, block.fontSize)).toBeLessThanOrEqual(
            888.01,
          );
      }
    }
  });
  it("wraps English at word boundaries and handles a word wider than a line", () => {
    const measure = (text: string) => text.length;
    expect(wrapShareText("Your word is a lamp", 9, 1, measure)).toEqual([
      "Your word",
      "is a lamp",
    ]);
    expect(wrapShareText("abcdefghijkl", 5, 1, measure)).toEqual([
      "abcde",
      "fghij",
      "kl",
    ]);
  });
  it("preserves complete Commons attribution in its reserved footer without touching scripture/date", () => {
    const credited = {
      ...payload,
      imageAuthor:
        "Charles Robert Smith / Wikimedia Commons community contributors",
      imageSourceUrl:
        "https://commons.wikimedia.org/wiki/File:Panoramic_view_of_the_mountains_and_lake_at_sunrise_with_clouds_and_reflections_in_the_water_2026.jpg",
      imageLicense: "CC BY-SA 4.0",
      imageLicenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    };
    for (const format of ["square", "portrait"] as const) {
      const footer = layoutShareAttribution(credited, format);
      const output = footer.lines.join("").replace(/\s/g, "");
      for (const required of [
        credited.imageAuthor,
        credited.imageSourceUrl,
        credited.imageLicense,
        credited.imageLicenseUrl,
        "resized/cropped; dark overlay",
      ])
        expect(output).toContain(required.replace(/\s/g, ""));
      expect(footer.fontSize).toBeGreaterThanOrEqual(12);
      expect(footer.lines.length * footer.lineHeight).toBeLessThanOrEqual(
        footer.availableHeight,
      );
      for (const line of footer.lines)
        expect(estimateShareText(line, footer.fontSize)).toBeLessThanOrEqual(
          footer.width,
        );
      const artwork = layoutShareText(credited, format);
      const last = artwork.blocks[1];
      expect(last.y + 32 + last.lines.length * last.lineHeight).toBeLessThan(
        artwork.height - 292,
      );
      expect(footer.y).toBeGreaterThan(artwork.height - 246 + 22);
    }
  });
  it("labels both translations according to the primary reading language", () => {
    expect(layoutShareText(payload, "square").primaryVersion).toBe("和合本");
    expect(
      layoutShareText({ ...payload, primaryLocale: "en" }, "portrait")
        .secondaryVersion,
    ).toBe("和合本");
  });
});
