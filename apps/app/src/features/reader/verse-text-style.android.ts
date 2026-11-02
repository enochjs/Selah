import { baseVerseTextStyle } from "./verse-text-style.shared";

/** Keep Android's narrower reading page comfortable without changing saved preferences. */
export function verseTextStyle(...args: Parameters<typeof baseVerseTextStyle>) {
  const [language, secondary, , lineHeight] = args;
  const style = baseVerseTextStyle(...args);
  const size =
    language === "en"
      ? Math.max(
          secondary ? 13 : 0,
          Math.round(style.fontSize * (17 / 18) * 2) / 2,
        )
      : style.fontSize;
  const spacing =
    language === "en" ? Math.max(1.4, lineHeight - 0.05) : lineHeight;

  return {
    ...style,
    fontSize: size,
    lineHeight: size * spacing,
    includeFontPadding: false,
  };
}
