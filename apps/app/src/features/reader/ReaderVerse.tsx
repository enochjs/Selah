import React from "react";
import { View, Pressable } from "react-native";
import type { ChapterRecording, Locale, Verse } from "../../domain/models";
import type { VerseLayout } from "../../domain/reading";
import {
  isVerseMissing,
  missingVerseFragments,
} from "../../domain/scripture-audio";
import { colors as c } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import type { WordSelection } from "../vocabulary/WordDialog";
import { VerseText } from "./VerseText";
import type { ReadingFonts } from "../../domain/reading-fonts";

interface Props {
  verse: Verse;
  bookEnglish: string;
  chapter: number;
  interactive: boolean;
  mobile: boolean;
  primaryLocale: Locale;
  showTranslation: boolean;
  fontSize: number;
  lineHeight: number;
  readingFonts?: ReadingFonts;
  knownWords: ReadonlySet<string>;
  active: boolean;
  recording: ChapterRecording | null;
  registerVerse: (layout: VerseLayout) => void;
  onWord: (selection: WordSelection) => void;
  onSelect: (verse: number) => void;
}

// A selection/bookmark change updates only the affected rows; text in the rest
// of the chapter retains its token nodes and event handlers.
export const ReaderVerse = React.memo(function ReaderVerse({
  verse: v,
  bookEnglish,
  chapter,
  interactive,
  mobile,
  primaryLocale,
  showTranslation,
  fontSize,
  lineHeight,
  readingFonts,
  knownWords,
  active,
  recording,
  registerVerse,
  onWord,
  onSelect,
}: Props) {
  const { bi } = useI18n();
  const missingNarration = isVerseMissing(recording, v.number);
  return (
    <Pressable
      accessible={false}
      focusable={false}
      accessibilityLabel={bi(
        `选择第 ${v.number} 节`,
        `Select verse ${v.number}`,
      )}
      onPress={() => onSelect(v.number)}
      onLayout={(e) => {
        registerVerse({
          verse: v.number,
          y: e.nativeEvent.layout.y,
          height: e.nativeEvent.layout.height,
        });
      }}
      style={{
        backgroundColor: active ? "#F3F6EF" : "transparent",
        borderLeftWidth: 2,
        borderLeftColor: active ? "#7B9365" : "transparent",
        paddingLeft: mobile ? 10 : 12,
        paddingRight: mobile ? 12 : 14,
        paddingVertical: showTranslation ? 10 : 7,
      }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <VerseText
          verse={v}
          showVerseNumber
          onVersePress={() => onSelect(v.number)}
          chapter={chapter}
          primaryLocale={primaryLocale}
          showTranslation={showTranslation}
          fontSize={fontSize}
          lineHeight={lineHeight}
          readingFonts={readingFonts}
          active={active}
          interactive={interactive}
          knownWords={knownWords}
          onWord={(word) => {
            onWord({
              word,
              reference: `${bookEnglish} ${chapter}:${v.number}`,
              context: v.en,
            });
          }}
          onChinesePress={() => onSelect(v.number)}
        />
        {missingNarration && (
          <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
            {bi("原录音未朗读本节", "Not narrated in the source recording")}
          </Txt>
        )}
        {missingVerseFragments(recording, v.number).map((text) => (
          <Txt
            key={text}
            style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}
          >
            {bi("本段原录音未朗读：", "Not narrated in the source recording: ")}
            {text}
          </Txt>
        ))}
      </View>
    </Pressable>
  );
});
