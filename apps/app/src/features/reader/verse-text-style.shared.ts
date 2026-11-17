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
  _active = false,
  readingFonts?: ReadingFonts,
) {
  const size = secondary ? Math.max(13, Math.round(fontSize * 0.78)) : fontSize;
  const primaryColor = language === "en" ? c.readingEnglishInk : c.readingInk;
  const secondaryColor =
    language === "en" ? c.readingEnglishSecondary : c.readingSecondary;
  return {
    fontFamily: readingFontFamily(language, readingFonts),
    fontSize: size,
    lineHeight: size * lineHeight,
    letterSpacing: 0,
    color: secondary ? secondaryColor : primaryColor,
  };
}
