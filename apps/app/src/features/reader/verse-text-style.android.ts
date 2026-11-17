import { baseVerseTextStyle } from "./verse-text-style.shared";

/** Use the requested reading metrics with Android's extra font padding removed. */
export function verseTextStyle(...args: Parameters<typeof baseVerseTextStyle>) {
  return {
    ...baseVerseTextStyle(...args),
    includeFontPadding: false,
  };
}
