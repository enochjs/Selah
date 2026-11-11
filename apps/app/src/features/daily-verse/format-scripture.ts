import type { Locale } from "../../domain/models";

export function formatDailyVerseText(text: string, locale: Locale): string {
  if (locale !== "en") return text;
  // An isolated excerpt needs only the innermost opening quote from nested speech.
  return text.replace(/^[“‘"'](?:[^\S\r\n]*[“‘"'])+/u, (quotes) =>
    quotes.slice(-1),
  );
}
