import React from "react";
import { View } from "react-native";
import type { Locale, Verse, VocabularyWord } from "../../domain/models";
import { tokenizeEnglishWords } from "../../domain/word-tokenization";
import { englishVersion } from "../../data/resource-info";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { verseTextStyle } from "./verse-text-style";

interface VerseTextProps {
  verse: Verse;
  chapter: number;
  primaryLocale: Locale;
  showTranslation: boolean;
  fontSize: number;
  lineHeight: number;
  active: boolean;
  words: VocabularyWord[];
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
  words,
  onWord,
  onChinesePress,
}: VerseTextProps) {
  const { bi } = useI18n();
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
        const { fontSize: size, color } = style;
        return language === "en" ? (
          <Txt key={language} style={style}>
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
            {tokenizeEnglishWords(v.en).map(({ text, word: normalized }, i) => {
              const known = words.some((item) => item.word === normalized);
              return (
                <Txt
                  key={i}
                  onPress={normalized ? () => onWord(normalized) : undefined}
                  style={{
                    ...style,
                    color: known ? c.green : color,
                    textDecorationLine: known ? "underline" : "none",
                    textDecorationColor: "#B8C5A8",
                  }}
                >
                  {text}
                </Txt>
              );
            })}
          </Txt>
        ) : (
          <Txt key={language} onPress={onChinesePress} style={style}>
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
