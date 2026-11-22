import React from "react";
import { View } from "react-native";
import { bibleRepository } from "../../data/bible-repository";
import {
  primaryVersions,
  resolveComparisonVersion,
  versionText,
} from "../../data/reading-versions";
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
  const comparisonVersionId = useAppStore((s) => s.comparisonVersionId);
  const fontSize = useAppStore((s) => s.fontSize);
  const lineHeight = useAppStore((s) => s.lineHeight);
  const readingFonts = useAppStore((s) => s.readingFonts);
  const { bi } = useI18n();
  const book = bibleRepository.getBook("psalms");
  const verse = bibleRepository
    .getChapter("psalms", 23)
    .find((v) => v.number === 1);
  if (!verse) return null;
  const versions = [primaryVersions[primaryLocale]];
  if (showTranslation)
    versions.push(resolveComparisonVersion(primaryLocale, comparisonVersionId));
  return (
    <View style={{ gap: 12 }}>
      {versions.map((version, index) => {
        const text = versionText(verse, version);
        return (
          text && (
            <Txt
              key={version.id}
              style={verseTextStyle(
                version.language,
                index > 0,
                fontSize,
                lineHeight,
                false,
                readingFonts,
                c,
              )}
            >
              {text}
            </Txt>
          )
        );
      })}
      <Txt style={{ color: c.textMuted, fontSize: typeScale.caption }}>
        {bi(book.zh, book.en)} 23:1
      </Txt>
    </View>
  );
}
