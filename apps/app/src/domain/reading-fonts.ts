export const chineseReadingFonts = [
  "noto-serif-sc",
  "noto-sans-sc",
  "lxgw-wenkai",
  "system",
] as const;
export const englishReadingFonts = [
  "source-serif-4",
  "lora",
  "dm-sans",
  "system",
] as const;

export interface ReadingFonts {
  zh: (typeof chineseReadingFonts)[number];
  en: (typeof englishReadingFonts)[number];
}

export const defaultReadingFonts: ReadingFonts = {
  zh: "lxgw-wenkai",
  en: "lora",
};

/** Missing or removed font choices fall back to the preferred reading typography. */
export function restoreReadingFonts(value: unknown): ReadingFonts {
  const saved =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  return {
    zh:
      chineseReadingFonts.find((font) => font === saved.zh) ??
      defaultReadingFonts.zh,
    en:
      englishReadingFonts.find((font) => font === saved.en) ??
      defaultReadingFonts.en,
  };
}
