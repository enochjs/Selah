import React from "react";
import { View } from "react-native";
import { bibleRepository } from "../../data/bible-repository";
import type { Locale } from "../../domain/models";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { typeScale } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { verseTextStyle } from "../reader/verse-text-style";

export function ReadingPreview() {
  const { colors: c } = useTheme();
  const primaryLocale = useAppStore((s) => s.primaryLocale);
  const showTranslation = useAppStore((s) => s.showTranslation);
  const fontSize = useAppStore((s) => s.fontSize);
  const lineHeight = useAppStore((s) => s.lineHeight);
  const readingFonts = useAppStore((s) => s.readingFonts);
  const { bi } = useI18n();
  const book = bibleRepository.getBook("psalms");
  const verse = bibleRepository
    .getChapter("psalms", 23)
    .find((v) => v.number === 1);
  const languages: Locale[] = showTranslation
    ? [primaryLocale, primaryLocale === "en" ? "zh" : "en"]
    : [primaryLocale];
  if (!verse) return null;
  return (
    <View style={{ gap: 12 }}>
      {languages.map((language, index) => (
        <Txt
          key={language}
          style={verseTextStyle(
            language,
            index > 0,
            fontSize,
            lineHeight,
            false,
            readingFonts,
            c,
          )}
        >
          {verse[language]}
        </Txt>
      ))}
      <Txt style={{ color: c.textMuted, fontSize: typeScale.caption }}>
        {bi(book.zh, book.en)} 23:1
      </Txt>
    </View>
  );
}
