import React, { useEffect, useImperativeHandle, useMemo, useRef } from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { colors as c, fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { getChapterRecording } from "../../data/audio-repository";
import { narrationVerseToFollow } from "../../domain/reading";
import { matchesVerseAudio } from "../../domain/scripture-audio";
import { ReaderVerse } from "./ReaderVerse";
import { useReadingProgress } from "./useReadingProgress";
import type { WordSelection } from "../vocabulary/WordDialog";
import { readerToolbarHeight, readerBottomClearance } from "./reader-layout";

export interface ReaderPageHandle {
  flush: () => void;
  preservePosition: () => void;
}
interface Props {
  bookId: string;
  chapter: number;
  current: boolean;
  onWord: (selection: WordSelection) => void;
  onSelectVerse: (verse: number) => void;
  ref?: React.Ref<ReaderPageHandle>;
}

function ReaderPageContent({
  bookId,
  chapter,
  current,
  onWord,
  onSelectVerse,
  ref,
}: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const insets = useSafeAreaInsets();
  const topInset = mobile ? readerToolbarHeight : 0;
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const primaryLocale = useAppStore((state) => state.primaryLocale);
  const showTranslation = useAppStore((state) => state.showTranslation);
  const fontSize = useAppStore((state) => state.fontSize);
  const lineHeight = useAppStore((state) => state.lineHeight);
  const readingFonts = useAppStore((state) => state.readingFonts);
  const selectedVerse = useAppStore((state) =>
    current ? state.selectedVerse : 0,
  );
  const words = useAppStore((state) => state.words);
  const book = bibleRepository.getBook(bookId);
  const verses = bibleRepository.getChapter(bookId, chapter);
  const tracks = useMemo(
    () => chapterTracks(bookId, chapter, primaryLocale),
    [bookId, chapter, primaryLocale],
  );
  const knownWords = useMemo(
    () => new Set(words.map((word) => word.word)),
    [words],
  );
  const recording = getChapterRecording(bookId, chapter, primaryLocale);
  const available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const followingNarration = useAppStore((s) => s.followingNarration);
  const narrationActive =
    current &&
    (audio.playing || audio.repeat === "verse") &&
    audio.track?.kind === "scripture" &&
    audio.track.bookId === bookId &&
    audio.track.chapter === chapter &&
    audio.track.locale === primaryLocale &&
    audio.track.verse !== undefined;
  const {
    scrollToVerse,
    isForeground,
    flush,
    preservePosition,
    onLayout,
    onContentSizeChange,
    onScroll,
    registerVerse,
  } = useReadingProgress(bookId, chapter, scrollRef, topInset);
  useEffect(() => {
    const track = audio.track;
    if (
      followingNarration &&
      current &&
      isForeground() &&
      audio.playing &&
      track?.kind === "scripture" &&
      track.bookId &&
      track.chapter &&
      (track.bookId !== bookId || track.chapter !== chapter)
    ) {
      flush();
      useAppStore
        .getState()
        .followNarration(track.bookId, track.chapter, track.verse ?? 1);
      return;
    }
    const verse = narrationVerseToFollow(audio.track, {
      bookId,
      chapter,
      following: followingNarration,
      foreground: current && isForeground(),
      playing: audio.playing,
    });
    if (verse) {
      useAppStore.getState().setSelectedVerse(verse);
      scrollToVerse(verse);
    }
    // Follow track changes only; manual scrolling and verse selection stay in the reader's control.
  }, [
    audio.track,
    audio.playing,
    bookId,
    chapter,
    followingNarration,
    scrollToVerse,
    isForeground,
    current,
    flush,
  ]);

  useImperativeHandle(ref, () => ({ flush, preservePosition }), [
    flush,
    preservePosition,
  ]);
  const sectionTitle =
    bookId === "psalms" && chapter === 23
      ? bi("耶和华是我的牧者", "The Lord is my shepherd")
      : bookId === "john" && chapter === 1
        ? bi("道成了肉身", "The Word became flesh")
        : bookId === "genesis" && chapter === 1
          ? bi("起初，神创造天地", "In the beginning")
          : null;

  return (
    <View
      style={{ flex: 1 }}
      pointerEvents={current ? "auto" : "none"}
      accessibilityElementsHidden={!current}
      importantForAccessibility={current ? "auto" : "no-hide-descendants"}
    >
      <ScrollView
        nestedScrollEnabled
        ref={scrollRef}
        key={`${bookId}-${chapter}`}
        showsVerticalScrollIndicator={false}
        onLayout={(event) => onLayout(event.nativeEvent.layout.height)}
        onContentSizeChange={onContentSizeChange}
        onScroll={onScroll}
        onScrollEndDrag={flush}
        onMomentumScrollEnd={flush}
        scrollEventThrottle={80}
        contentContainerStyle={{
          paddingHorizontal: mobile ? 0 : 34,
          // Constant scroll clearance lets chapter endings clear the overlaid tabs.
          paddingBottom: mobile
            ? readerBottomClearance + insets.bottom + 24
            : 24,
        }}
      >
        <View
          style={{
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
            paddingTop: mobile ? topInset + 4 : 20,
          }}
        >
          <View
            style={{
              paddingVertical:
                sectionTitle || chapterOnlyAudio || !available ? 10 : 4,
              paddingLeft: mobile ? 12 : 14,
              gap: 6,
            }}
          >
            {sectionTitle && (
              <Txt
                style={{
                  fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                  fontSize: mobile ? 20 : 24,
                  lineHeight: mobile ? 30 : 36,
                }}
              >
                {sectionTitle}
              </Txt>
            )}
            {chapterOnlyAudio && (
              <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
                {bi(
                  "本章支持整章朗读，暂不支持逐节播放",
                  "Full chapter audio available · verse playback unavailable",
                )}
              </Txt>
            )}
            {!available && (
              <Txt style={{ color: c.textGold, fontSize: 12, lineHeight: 18 }}>
                {bi(
                  "音频暂不可用，仍可阅读经文",
                  "Audio unavailable · you can keep reading",
                )}
              </Txt>
            )}
          </View>
          {verses.map((verse) => {
            // Playback highlighting follows semantic track changes even when a
            // manual selection has disabled narration scrolling.
            const active =
              (narrationActive &&
                matchesVerseAudio(audio.track, {
                  bookId,
                  chapter,
                  verse: verse.number,
                  locale: primaryLocale,
                })) ||
              (!(narrationActive && followingNarration) &&
                selectedVerse === verse.number);
            return (
              <ReaderVerse
                key={verse.number}
                verse={verse}
                bookEnglish={book.en}
                chapter={chapter}
                current={current}
                mobile={mobile}
                primaryLocale={primaryLocale}
                showTranslation={showTranslation}
                fontSize={fontSize}
                lineHeight={lineHeight}
                readingFonts={readingFonts}
                knownWords={knownWords}
                active={active}
                recording={recording}
                registerVerse={registerVerse}
                onWord={onWord}
                onSelect={onSelectVerse}
              />
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}

// Cached pages cannot receive input. Refresh their action callbacks when activated,
// rather than rebuilding every chapter's text after each toolbar/store update.
export const ReaderPage = React.memo(
  ReaderPageContent,
  (previous, next) =>
    previous.bookId === next.bookId &&
    previous.chapter === next.chapter &&
    previous.current === next.current &&
    previous.ref === next.ref &&
    (!next.current ||
      (previous.onWord === next.onWord &&
        previous.onSelectVerse === next.onSelectVerse)),
);
