import { expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  themes,
  resolveTheme,
  restoreThemePreference,
} from "../src/shared/theme-palettes";

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const [r, g, b] = hex
      .slice(1)
      .match(/../g)!
      .map((channel) => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
    return r * 0.2126 + g * 0.7152 + b * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

it("resolves system mode and keeps explicit choices independent of the device", () => {
  expect(resolveTheme("system", "dark")).toBe(themes.night);
  expect(resolveTheme("system", "light")).toBe(themes.olive);
  expect(resolveTheme("system", null)).toBe(themes.olive);
  for (const id of ["olive", "mist", "night", "redemption"] as const) {
    expect(resolveTheme(id, "dark")).toBe(themes[id]);
    expect(resolveTheme(id, "light")).toBe(themes[id]);
    expect(restoreThemePreference(id)).toBe(id);
  }
  expect(restoreThemePreference("system")).toBe("system");
  expect(restoreThemePreference("unknown")).toBe("olive");
});

it.each(["olive", "mist", "night", "redemption"] as const)(
  "keeps %s controls and scripture readable",
  (id) => {
    const c = themes[id].colors;
    for (const bg of [c.background, c.surface, c.surfaceMuted, c.primarySoft]) {
      for (const text of [c.text, c.textMuted, c.textSecondary, c.primary]) {
        expect(
          contrast(text, bg),
          `${id}: ${text} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    for (const [foreground, background] of [
      [c.danger, c.dangerSoft],
      [c.danger, c.background],
      [c.accentText, c.warmSurface],
      [c.warningText, c.warningSoft],
      [c.infoText, c.infoSoft],
    ]) {
      expect(contrast(foreground, background)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(c.onPrimary, c.primary)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(c.onPrimaryStrong, c.primaryStrong)).toBeGreaterThanOrEqual(
      4.5,
    );
    for (const bg of [c.background, c.readingActive]) {
      for (const text of [
        c.readingInk,
        c.readingEnglishInk,
        c.readingSecondary,
        c.readingEnglishSecondary,
        c.readingNumber,
      ]) {
        expect(
          contrast(text, bg),
          `${id}: scripture ${text} on ${bg}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(c.onScripture, c.scriptureBackdrop)).toBeGreaterThanOrEqual(
      7,
    );
    expect(Object.keys(c)).toEqual(Object.keys(themes.olive.colors));
  },
);

it("routes application colors through theme context instead of static palette imports", () => {
  const root = new URL("../src", import.meta.url).pathname;
  function check(directory: string) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const file = join(directory, item.name);
      if (item.isDirectory()) check(file);
      else if (/\.tsx?$/.test(file)) {
        const source = readFileSync(file, "utf8");
        expect(source, file).not.toMatch(
          /import\s*\{[^}]*\bcolors\b[^}]*\}\s*from\s*["'][^"']*\/theme["']/,
        );
      }
    }
  }
  check(root);
});

it("names the crimson theme after its colour in both interface languages", () => {
  expect(themes.redemption.name).toEqual({ zh: "绯红", en: "Crimson" });
});
