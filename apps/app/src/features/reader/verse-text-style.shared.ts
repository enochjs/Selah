import type { Locale } from "../../domain/models";
import { colors as c } from "../../shared/theme";
import type { ReadingFonts } from "../../domain/reading-fonts";
import { readingFontFamily } from "../../shared/reading-fonts";

/** Reading typography shared by interactive verses and the settings preview. */
export function baseVerseTextStyle(
  language: Locale,
  secondary: boolean,
  fontSize: number,
  lineHeight: number,
  active = false,
  readingFonts?: ReadingFonts,
) {
  const size = secondary ? Math.max(13, Math.round(fontSize * 0.78)) : fontSize;
  const primaryColor = language === "en" ? "#454D40" : c.ink;
  return {
    fontFamily: readingFontFamily(language, readingFonts),
    fontSize: size,
    lineHeight: size * lineHeight,
    letterSpacing: language === "zh" ? size * 0.025 : 0,
    color: secondary ? c.secondaryText : active ? "#3A4E32" : primaryColor,
  };
}
