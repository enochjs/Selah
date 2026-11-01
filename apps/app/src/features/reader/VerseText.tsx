import React, { useMemo } from "react";
import { View } from "react-native";
import type { Locale, Verse, VocabularyWord } from "../../domain/models";
import { tokenizeEnglishWords } from "../../domain/word-tokenization";
import { englishVersion } from "../../data/resource-info";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { verseTextStyle } from "./verse-text-style";
import { WordText } from "./WordText";

interface VerseTextProps {
  verse: Verse;
  chapter: number;
  primaryLocale: Locale;
  showTranslation: boolean;
  fontSize: number;
  lineHeight: number;
  active: boolean;
  interactive?: boolean;
  showVerseNumber?: boolean;
  onVersePress?: () => void;
  words?: VocabularyWord[];
  knownWords?: ReadonlySet<string>;
  onWord: (word: string) => void;
  onChinesePress?: () => void;
}

export function VerseText({
  verse: v,
  chapter,
  primaryLocale,
  showTranslation,
  fontSize,
  lineHeight,
  active,
  interactive = true,
  showVerseNumber = false,
  onVersePress,
  words,
  knownWords: sharedKnownWords,
  onWord,
  onChinesePress,
}: VerseTextProps) {
  const { bi } = useI18n();
  const tokens = useMemo(() => tokenizeEnglishWords(v.en), [v.en]);
  const knownWords = useMemo(
    () => sharedKnownWords ?? new Set(words?.map((word) => word.word)),
    [sharedKnownWords, words],
  );
  const languages: Locale[] = showTranslation
    ? [primaryLocale, primaryLocale === "en" ? "zh" : "en"]
    : [primaryLocale];
  return (
    <View style={{ gap: 8 }}>
      {languages.map((language, index) => {
        const style = verseTextStyle(
          language,
          index > 0,
          fontSize,
          lineHeight,
          active,
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
                fontFamily: fonts.medium,
                fontSize: size,
                color: active ? c.green : c.muted,
              }}
            >
              {String(v.number).replace(
                /\d/g,
                (digit) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(digit)],
              ) + " "}
            </Txt>
          ) : null;
        return language === "en" ? (
          <Txt key={language} style={style}>
            {verseNumber}
            {v.enOmitted && (
              <Txt
                style={{
                  color: c.muted,
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
            {v.enMergedInto && (
              <Txt
                style={{
                  color: c.muted,
                  fontFamily: fonts.italic,
                  fontSize: size,
                }}
              >
                {`(${englishVersion}: included in ${v.enMergedInto.chapter}:${v.enMergedInto.verse})`}
              </Txt>
            )}
            {tokens.map(({ text, word: normalized }, i) => {
              if (!normalized) return text;
              const known = knownWords.has(normalized);
              if (!interactive && !known) return text;
              return (
                <WordText
                  key={i}
                  text={text}
                  known={known}
                  interactive={interactive}
                  onSelect={onVersePress}
                  onLookup={() => onWord(normalized)}
                />
              );
            })}
          </Txt>
        ) : (
          <Txt
            key={language}
            onPress={
              interactive && onChinesePress
                ? (event) => {
                    event.stopPropagation();
                    onChinesePress();
                  }
                : undefined
            }
            style={style}
          >
            {verseNumber}
            {(v.zhMergedFrom
              ? `（${v.zhMergedFrom[0]}–${v.zhMergedFrom.at(-1)} ${bi("合并朗读", "read together")}）`
              : "") +
              (v.zh ||
                bi(
                  `（本节中文合并在 ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto}）`,
                  `(CUV: included in ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto})`,
                ))}
          </Txt>
        );
      })}
    </View>
  );
}
