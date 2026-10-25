import React, { useEffect, useImperativeHandle, useRef } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { Bookmark, Pause, Play, Repeat1 } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, IconButton } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { matchesVerseAudio } from "../../domain/scripture-audio";
import { narrationVerseToFollow } from "../../domain/reading";
import { VerseText } from "./VerseText";
import { useReadingProgress } from "./useReadingProgress";
import type { WordSelection } from "../vocabulary/WordDialog";

export interface ReaderPageHandle {
  flush: () => void;
}
interface Props {
  bookId: string;
  chapter: number;
  current: boolean;
  onWord: (selection: WordSelection) => void;
  onPlay: (verse: number, loop?: boolean) => void;
  onToggleNarration: () => void;
  ref?: React.Ref<ReaderPageHandle>;
}

function ReaderPageContent({
  bookId,
  chapter,
  current,
  onWord,
  onPlay,
  onToggleNarration,
  ref,
}: Props) {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const primaryLocale = useAppStore((state) => state.primaryLocale);
  const showTranslation = useAppStore((state) => state.showTranslation);
  const fontSize = useAppStore((state) => state.fontSize);
  const lineHeight = useAppStore((state) => state.lineHeight);
  const selectedVerse = useAppStore((state) =>
    current ? state.selectedVerse : 0,
  );
  const bookmarks = useAppStore((state) => state.bookmarks);
  const words = useAppStore((state) => state.words);
  const book = bibleRepository.getBook(bookId);
  const verses = bibleRepository.getChapter(bookId, chapter);
  const tracks = chapterTracks(bookId, chapter, primaryLocale);
  const available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const followingNarration = useAppStore((s) => s.followingNarration);
  const {
    scrollToVerse,
    isForeground,
    flush,
    onLayout,
    onContentSizeChange,
    onScroll,
    registerVerse,
  } = useReadingProgress(bookId, chapter, scrollRef);
  useEffect(() => {
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
  ]);

  useImperativeHandle(ref, () => ({ flush }), [flush]);
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
          paddingHorizontal: mobile ? 16 : 34,
          paddingBottom: 20,
        }}
      >
        <View
          style={{
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
            paddingTop: mobile ? 8 : 20,
          }}
        >
          <View
            style={{
              paddingVertical:
                sectionTitle || chapterOnlyAudio || !available ? 14 : 6,
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
              <Txt style={{ color: c.muted, fontSize: 11, lineHeight: 18 }}>
                {bi(
                  "本章支持整章朗读，暂不支持逐节播放",
                  "Full chapter audio available · verse playback unavailable",
                )}
              </Txt>
            )}
            {!available && (
              <Txt style={{ color: c.gold, fontSize: 11, lineHeight: 18 }}>
                {bi(
                  "音频暂不可用，仍可阅读经文",
                  "Audio unavailable · you can keep reading",
                )}
              </Txt>
            )}
          </View>
          {verses.map((v) => {
            const key = `${bookId}:${chapter}:${v.number}`,
              saved = bookmarks.includes(key),
              active = selectedVerse === v.number,
              verseRecording = matchesVerseAudio(audio.track, {
                bookId,
                chapter,
                verse: v.number,
                locale: primaryLocale,
              }),
              versePlaying = verseRecording && audio.playing;
            return (
              <Pressable
                accessible={false}
                focusable={false}
                onPress={() =>
                  useAppStore.getState().setSelectedVerse(v.number)
                }
                key={v.number}
                onLayout={(e) => {
                  registerVerse({
                    verse: v.number,
                    y: e.nativeEvent.layout.y,
                    height: e.nativeEvent.layout.height,
                  });
                }}
                style={{
                  backgroundColor: active ? "#F0F4EB" : "transparent",
                  borderLeftWidth: 3,
                  borderLeftColor: active ? "#7B9365" : "transparent",
                  paddingLeft: mobile ? 7 : 12,
                  paddingRight: mobile ? 4 : 8,
                  paddingVertical: 10,
                  minHeight: 102,
                }}
              >
                <View style={{ flexDirection: "row", gap: mobile ? 10 : 17 }}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={bi(
                      chapterOnlyAudio || !available
                        ? `选择第 ${v.number} 节`
                        : `播放第 ${v.number} 节`,
                      chapterOnlyAudio || !available
                        ? `Select verse ${v.number}`
                        : `Play verse ${v.number}`,
                    )}
                    onPress={() => {
                      if (chapterOnlyAudio || !available)
                        useAppStore.getState().setSelectedVerse(v.number);
                      else onPlay(v.number);
                    }}
                    style={{
                      paddingTop: 5,
                      width: 15,
                      alignItems: "center",
                    }}
                  >
                    {versePlaying ? (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "flex-end",
                          gap: 2,
                          height: 16,
                        }}
                      >
                        <View
                          style={{
                            width: 2,
                            height: 7,
                            backgroundColor: c.green,
                          }}
                        />
                        <View
                          style={{
                            width: 2,
                            height: 14,
                            backgroundColor: c.green,
                          }}
                        />
                        <View
                          style={{
                            width: 2,
                            height: 10,
                            backgroundColor: c.green,
                          }}
                        />
                      </View>
                    ) : (
                      <Txt
                        style={{
                          color: active ? c.green : "#A0A58F",
                          fontSize: 11,
                          fontFamily: fonts.medium,
                        }}
                      >
                        {String(v.number).padStart(2, "0")}
                      </Txt>
                    )}
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <VerseText
                      verse={v}
                      chapter={chapter}
                      primaryLocale={primaryLocale}
                      showTranslation={showTranslation}
                      fontSize={fontSize}
                      lineHeight={lineHeight}
                      active={active}
                      interactive={current}
                      words={words}
                      onWord={(word) => {
                        useAppStore.getState().setSelectedVerse(v.number);
                        onWord({
                          word,
                          reference: `${book.en} ${chapter}:${v.number}`,
                          context: v.en,
                        });
                      }}
                      onChinesePress={
                        chapterOnlyAudio || !available
                          ? undefined
                          : () => onPlay(v.number)
                      }
                    />
                  </View>
                  <View style={{ width: 28, paddingTop: 2 }}>
                    {active && (
                      <View style={{ gap: 1 }}>
                        <IconButton
                          icon={Bookmark}
                          active={saved}
                          fillActive
                          onPress={() =>
                            useAppStore.getState().toggleBookmark(key)
                          }
                          label={bi(
                            saved
                              ? `取消收藏第 ${v.number} 节`
                              : `收藏第 ${v.number} 节`,
                            saved
                              ? `Remove bookmark for verse ${v.number}`
                              : `Bookmark verse ${v.number}`,
                          )}
                          size={12}
                          visualSize={20}
                          style={{ width: 28, height: 26 }}
                        />
                        <IconButton
                          icon={versePlaying ? Pause : Play}
                          active={versePlaying}
                          disabled={chapterOnlyAudio || !available}
                          onPress={() =>
                            verseRecording
                              ? onToggleNarration()
                              : onPlay(v.number)
                          }
                          label={bi(
                            versePlaying
                              ? `暂停第 ${v.number} 节`
                              : verseRecording
                                ? `继续朗读第 ${v.number} 节`
                                : `朗读第 ${v.number} 节`,
                            versePlaying
                              ? `Pause verse ${v.number}`
                              : verseRecording
                                ? `Resume verse ${v.number}`
                                : `Listen to verse ${v.number}`,
                          )}
                          size={12}
                          visualSize={20}
                          style={{ width: 28, height: 26 }}
                        />
                        <IconButton
                          icon={Repeat1}
                          active={verseRecording && audio.repeat === "verse"}
                          disabled={chapterOnlyAudio || !available}
                          onPress={() => {
                            if (verseRecording)
                              audio.setRepeat(
                                audio.repeat === "verse" ? "off" : "verse",
                              );
                            else onPlay(v.number, true);
                          }}
                          label={bi(
                            `循环第 ${v.number} 节`,
                            `Loop verse ${v.number}`,
                          )}
                          size={12}
                          visualSize={20}
                          style={{ width: 28, height: 26 }}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
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
        previous.onPlay === next.onPlay &&
        previous.onToggleNarration === next.onToggleNarration)),
);
