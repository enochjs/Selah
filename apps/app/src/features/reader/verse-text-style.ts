import type { Locale } from "../../domain/models";
import { colors as c, fonts } from "../../shared/theme";

/** Reading typography shared by interactive verses and the settings preview. */
export function verseTextStyle(
  language: Locale,
  secondary: boolean,
  fontSize: number,
  lineHeight: number,
  active = false,
) {
  const size = secondary ? Math.max(13, Math.round(fontSize * 0.78)) : fontSize;
  return {
    fontFamily: language === "en" ? fonts.serif : fonts.regular,
    fontSize: size,
    lineHeight: size * lineHeight,
    color: secondary ? c.secondaryText : active ? "#3A4E32" : c.ink,
  };
}
