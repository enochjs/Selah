import React, { useMemo } from "react";
import { View } from "react-native";
import type { Locale, Verse, VocabularyWord } from "../../domain/models";
import { tokenizeScriptureWords } from "../../data/scripture-word-tokenization";
import {
  primaryVersions,
  resolveComparisonVersion,
  versionText,
} from "../../data/reading-versions";
import { vocabularyWordId } from "../../domain/vocabulary";
import { englishVersion } from "../../data/resource-info";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { verseTextStyle } from "./verse-text-style";
import { WordText } from "./WordText";
import type { ReadingFonts } from "../../domain/reading-fonts";

interface VerseTextProps {
  verse: Verse;
  chapter: number;
  primaryLocale: Locale;
  showTranslation: boolean;
  comparisonVersionId?: string | null;
  fontSize: number;
  lineHeight: number;
  readingFonts?: ReadingFonts;
  active: boolean;
  interactive?: boolean;
  showVerseNumber?: boolean;
  onVersePress?: () => void;
  words?: VocabularyWord[];
  knownWords?: ReadonlySet<string>;
  onWord: (word: string, language: string, context: string) => void;
}

export function VerseText({
  verse: v,
  chapter,
  primaryLocale,
  showTranslation,
  comparisonVersionId,
  fontSize,
  lineHeight,
  readingFonts,
  active,
  interactive = true,
  showVerseNumber = false,
  onVersePress,
  words,
  knownWords: sharedKnownWords,
  onWord,
}: VerseTextProps) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const knownWords = useMemo(
    () => sharedKnownWords ?? new Set(words?.map((word) => word.id)),
    [sharedKnownWords, words],
  );
  const paragraphs = useMemo(() => {
    const versions = [primaryVersions[primaryLocale]];
    if (showTranslation)
      versions.push(
        resolveComparisonVersion(primaryLocale, comparisonVersionId),
      );
    return versions.map((version) => {
      const text = versionText(v, version);
      return {
        version,
        text,
        tokens:
          interactive || knownWords.size
            ? tokenizeScriptureWords(text, version.language)
            : [],
      };
    });
  }, [
    v,
    primaryLocale,
    showTranslation,
    comparisonVersionId,
    interactive,
    knownWords,
  ]);
  return (
    <View style={{ gap: 8 }}>
      {paragraphs.map(({ version, text, tokens }, index) => {
        const { language, builtInLocale } = version;
        if (!text && !builtInLocale) return null;
        const style = verseTextStyle(
          language,
          index > 0,
          fontSize,
          lineHeight,
          active,
          readingFonts,
          c,
        );
        const { fontSize: size } = style;
        // Superscript glyphs flow with the paragraph on native and web alike.
        const verseNumber =
          showVerseNumber && index === 0 ? (
            <Txt
              accessibilityRole={interactive ? "button" : undefined}
              accessibilityLabel={bi(
                `选择第 ${v.number} 节`,
                `Select verse ${v.number}`,
              )}
              onPress={
                interactive
                  ? (event) => {
                      event.stopPropagation();
                      onVersePress?.();
                    }
                  : undefined
              }
              style={{
                fontFamily: fonts.regular,
                fontSize: size,
                color: c.readingNumber,
              }}
            >
              {String(v.number).replace(
                /\d/g,
                (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)],
              ) + " "}
            </Txt>
          ) : null;
        return (
          <Txt key={version.id} style={style}>
            {verseNumber}
            {builtInLocale === "en" && v.enOmitted && (
              <Txt
                style={{
                  color: c.textMuted,
                  fontFamily: fonts.italic,
                  fontSize: size,
                }}
              >
                {bi(
                  `（${englishVersion} 正文未收录本节，请参阅上下文或脚注）`,
                  `(This verse is omitted in the ${englishVersion} main text; see context or footnotes.)`,
                )}
              </Txt>
            )}
            {builtInLocale === "en" && v.enMergedInto && (
              <Txt
                style={{
                  color: c.textMuted,
                  fontFamily: fonts.italic,
                  fontSize: size,
                }}
              >
                {`(${englishVersion}: included in ${v.enMergedInto.chapter}:${v.enMergedInto.verse})`}
              </Txt>
            )}
            {builtInLocale === "zh" &&
              v.zhMergedFrom &&
              `（${v.zhMergedFrom[0]}–${v.zhMergedFrom.at(-1)} ${bi("合并朗读", "read together")}）`}
            {builtInLocale === "zh" &&
              !text &&
              bi(
                `（本节中文合并在 ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto}）`,
                `(CUV: included in ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto})`,
              )}
            {tokens.length
              ? tokens.map(({ text: displayed, word: normalized }, i) => {
                  if (!normalized) return displayed;
                  const known = knownWords.has(
                    vocabularyWordId(normalized, language),
                  );
                  if (!interactive && !known) return displayed;
                  return (
                    <WordText
                      key={i}
                      text={displayed}
                      known={known}
                      interactive={interactive}
                      onSelect={onVersePress}
                      onLookup={() => onWord(normalized, language, text)}
                    />
                  );
                })
              : text}
          </Txt>
        );
      })}
    </View>
  );
}
