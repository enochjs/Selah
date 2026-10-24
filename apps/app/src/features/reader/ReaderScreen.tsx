import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Play,
  Pause,
  Repeat1,
  MoreHorizontal,
  Bookmark,
  Type,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
import { getChapterRecording } from "../../data/audio-repository";
import {
  englishVersion,
  audioVersionLabel,
  resourceManifest,
  narrationDescription,
  isWebsiteResource,
} from "../../data/resource-info";
import { normalizeWord } from "../../domain/vocabulary";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, IconButton, Pill, Dialog } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { AudioControlsDialog } from "../audio/AudioControlsDialog";
import { matchesVerseAudio } from "../../domain/scripture-audio";
import { ChapterPicker } from "./ChapterPicker";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

import {
  adjacentChapter,
  captureChapterSwipe,
  chapterSwipe,
  narrationVerseToFollow,
} from "../../domain/reading";
import { useReadingProgress } from "./useReadingProgress";
import { hasTextSelection, useChapterKeyboard } from "./reader-input";

export function ReaderScreen() {
  const hydrated = useAppStore((s) => s.hydrated);
  const bookId = useAppStore((s) => s.bookId);
  const chapter = useAppStore((s) => s.chapter);
  return hydrated ? <ReaderChapter key={`${bookId}:${chapter}`} /> : null;
}

function ReaderChapter() {
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const bookId = useAppStore((s) => s.bookId),
    chapter = useAppStore((s) => s.chapter),
    readingMode = useAppStore((s) => s.readingMode);
  const selectedVerse = useAppStore((s) => s.selectedVerse),
    audioLocale = useAppStore((s) => s.audioLocale),
    fontSize = useAppStore((s) => s.fontSize);
  const bookmarks = useAppStore((s) => s.bookmarks),
    words = useAppStore((s) => s.words);
  const swipeLearned = useAppStore((s) => s.chapterSwipeLearned);
  const setChapter = useAppStore((s) => s.setChapter),
    setReadingMode = useAppStore((s) => s.setReadingMode),
    notify = useAppStore((s) => s.notify);
  const [pickerOpen, setPickerOpen] = useState(false),
    [typeOpen, setTypeOpen] = useState(false),
    [playbackOpen, setPlaybackOpen] = useState(false),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const following = useRef(false);
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
      following: following.current,
      foreground: isForeground(),
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
    scrollToVerse,
    isForeground,
  ]);
  const book = bibleRepository.getBook(bookId),
    verses = bibleRepository.getChapter(bookId, chapter);
  const tracks = chapterTracks(bookId, chapter, audioLocale),
    available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const selectedTrackIndex = chapterOnlyAudio
    ? 0
    : tracks.findIndex(
        (track) =>
          track.verse === selectedVerse ||
          track.coveredVerses?.includes(selectedVerse),
      );
  const chapterRecording = getChapterRecording(bookId, chapter, audioLocale);
  const chapterPlaying =
    audio.track?.bookId === bookId &&
    audio.track.chapter === chapter &&
    audio.playing;
  const allBooks = bibleRepository.listBooks();
  const previous = adjacentChapter(allBooks, bookId, chapter, -1);
  const next = adjacentChapter(allBooks, bookId, chapter, 1);
  const changeChapter = useCallback(
    (direction: -1 | 1) => {
      const target = adjacentChapter(allBooks, bookId, chapter, direction);
      if (!target) return;
      flush();
      setChapter(target.bookId, target.chapter);
    },
    [allBooks, bookId, chapter, setChapter, flush],
  );
  const interactionBlocked =
    pickerOpen || typeOpen || playbackOpen || selection !== null;
  useChapterKeyboard(!mobile && !interactionBlocked, changeChapter);
  const touch = useRef({ x: 0, y: 0, at: 0 });
  function startSwipe(event: GestureResponderEvent) {
    const { pageX, pageY, timestamp } = event.nativeEvent;
    touch.current = { x: pageX, y: pageY, at: timestamp };
    return false;
  }
  function captureSwipe(event: GestureResponderEvent) {
    const { pageX, pageY, timestamp, touches } = event.nativeEvent;
    return (
      mobile &&
      !interactionBlocked &&
      touches.length === 1 &&
      !hasTextSelection() &&
      captureChapterSwipe(
        pageX - touch.current.x,
        pageY - touch.current.y,
        timestamp - touch.current.at,
      )
    );
  }
  function finishSwipe(event: GestureResponderEvent) {
    if (interactionBlocked || hasTextSelection()) return;
    const { pageX, pageY, timestamp } = event.nativeEvent;
    const direction = chapterSwipe(
      pageX - touch.current.x,
      pageY - touch.current.y,
      timestamp - touch.current.at,
    );
    if (direction) {
      useAppStore.getState().learnChapterSwipe();
      changeChapter(direction);
    }
  }
  function playVerse(number: number, loop = false, allowWholeChapter = false) {
    useAppStore.getState().setSelectedVerse(number);
    if (!available) {
      notify(
        bi(
          "无法读取本章音频，请检查资源服务地址与连接。",
          "Chapter audio is unavailable. Check the resource server connection.",
        ),
      );
      return;
    }
    if (chapterOnlyAudio) {
      notify(
        bi(
          "此章时间轴不可用，可播放整章，暂不支持逐句循环。",
          "Verse timing is unavailable. You can listen to the full chapter.",
        ),
      );
      if (allowWholeChapter) {
        following.current = true;
        audio.setRepeat("off");
        audio.playQueue(tracks, 0);
      }
      return;
    }
    if (loop) audio.setRepeat("verse");
    const index = tracks.findIndex(
      (t) => t.verse === number || t.coveredVerses?.includes(number),
    );
    if (index < 0) {
      notify(
        bi(
          "本节在此译本中未收录，或暂无可定位的录音。",
          "This verse is omitted in this version or has no aligned audio.",
        ),
      );
      return;
    }
    following.current = true;
    audio.playQueue(tracks, index);
  }
  function toggleNarration() {
    following.current = true;
    audio.toggle();
  }
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
      onStartShouldSetResponderCapture={startSwipe}
      onMoveShouldSetResponderCapture={captureSwipe}
      onResponderRelease={finishSwipe}
      onResponderTerminationRequest={() => true}
    >
      <ScrollView
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
              paddingHorizontal: 0,
              paddingVertical: 10,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              borderBottomWidth: 1,
              borderColor: c.border,
              flexWrap: "wrap",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("选择书卷章节", "Choose book and chapter")}
              onPress={() => setPickerOpen(true)}
              style={{
                flexDirection: "row",
                gap: 9,
                alignItems: "center",
                padding: 2,
              }}
            >
              <BookOpen size={18} color={c.green} />
              <Txt style={{ fontFamily: fonts.bold, fontSize: 13 }}>
                {bi(book.zh, book.en)} {chapter}
              </Txt>
              <ChevronDown size={13} color={c.muted} />
            </Pressable>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
            >
              {!mobile && (
                <>
                  <IconButton
                    icon={ChevronLeft}
                    onPress={() => changeChapter(-1)}
                    disabled={!previous}
                    label={bi("上一章", "Previous chapter")}
                  />
                  <IconButton
                    icon={ChevronRight}
                    onPress={() => changeChapter(1)}
                    disabled={!next}
                    label={bi("下一章", "Next chapter")}
                  />
                </>
              )}
              <IconButton
                icon={chapterPlaying ? Pause : Headphones}
                active={chapterPlaying}
                onPress={() =>
                  chapterPlaying
                    ? toggleNarration()
                    : playVerse(selectedVerse, false, true)
                }
                label={
                  chapterPlaying
                    ? bi("暂停朗读", "Pause chapter")
                    : bi("朗读本章", "Listen to chapter")
                }
                size={18}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bi("阅读设置", "Reading settings")}
                onPress={() => setTypeOpen(true)}
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  minHeight: 38,
                  minWidth: 38,
                  justifyContent: "center",
                  paddingHorizontal: 5,
                }}
              >
                <Type size={17} color={c.muted} />
                {!mobile && (
                  <Txt style={{ fontSize: 11, color: c.muted }}>
                    {bi("阅读设置", "Reading settings")}
                  </Txt>
                )}
              </Pressable>
            </View>
          </View>
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
          {mobile && !swipeLearned && (
            <Pressable
              onPress={() => useAppStore.getState().learnChapterSwipe()}
              accessibilityRole="button"
              accessibilityLabel={bi(
                "知道了，左右滑动换章",
                "Dismiss swipe tip",
              )}
              style={{ paddingBottom: 12, alignItems: "center" }}
            >
              <Txt style={{ color: c.muted, fontSize: 11 }}>
                {bi(
                  "左滑下一章 · 右滑上一章",
                  "Swipe left for next · right for previous",
                )}
              </Txt>
            </Pressable>
          )}
          {verses.map((v) => {
            const key = `${bookId}:${chapter}:${v.number}`,
              saved = bookmarks.includes(key),
              active = selectedVerse === v.number,
              verseRecording = matchesVerseAudio(audio.track, {
                bookId,
                chapter,
                verse: v.number,
                locale: audioLocale,
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
                  minHeight: active ? 128 : 102,
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
                      else playVerse(v.number);
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
                    {readingMode !== "zh" && (
                      <Txt
                        style={{
                          fontFamily: fonts.serif,
                          fontSize,
                          lineHeight: fontSize * 1.55,
                          color: active ? "#3A4E32" : "#41473B",
                        }}
                      >
                        {v.enOmitted && (
                          <Txt
                            style={{
                              color: c.muted,
                              fontFamily: fonts.italic,
                              fontSize: 13,
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
                              fontSize: 13,
                            }}
                          >{`(${englishVersion}: included in ${v.enMergedInto.chapter}:${v.enMergedInto.verse})`}</Txt>
                        )}
                        {v.en.split(/(\s+)/).map((word, i) => {
                          const normalized = normalizeWord(word),
                            known = words.some((w) => w.word === normalized);
                          return (
                            <Txt
                              key={i}
                              onPress={
                                normalized
                                  ? () => {
                                      useAppStore
                                        .getState()
                                        .setSelectedVerse(v.number);
                                      setSelection({
                                        word: normalized,
                                        reference: `${book.en} ${chapter}:${v.number}`,
                                        context: v.en,
                                      });
                                    }
                                  : undefined
                              }
                              style={{
                                fontFamily: fonts.serif,
                                fontSize,
                                lineHeight: fontSize * 1.55,
                                color: known
                                  ? c.green
                                  : active
                                    ? "#3A4E32"
                                    : "#41473B",
                                textDecorationLine: known
                                  ? "underline"
                                  : "none",
                                textDecorationColor: "#B8C5A8",
                              }}
                            >
                              {word}
                            </Txt>
                          );
                        })}
                      </Txt>
                    )}
                    {readingMode !== "en" && (
                      <Txt
                        onPress={
                          chapterOnlyAudio || !available
                            ? undefined
                            : () => playVerse(v.number)
                        }
                        style={{
                          fontSize: readingMode === "zh" ? fontSize : 13,
                          lineHeight:
                            readingMode === "zh" ? fontSize * 1.65 : 21,
                          color: readingMode === "zh" ? c.ink : "#8B9280",
                          marginTop: readingMode === "parallel" ? 8 : 0,
                        }}
                      >
                        {(v.zhMergedFrom
                          ? `（${v.zhMergedFrom[0]}–${v.zhMergedFrom.at(-1)} ${bi("合并朗读", "read together")}）`
                          : "") +
                          (v.zh ||
                            bi(
                              `（本节中文合并在 ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto}）`,
                              `(CUV: included in ${v.zhMergedChapter ?? chapter}:${v.zhMergedInto})`,
                            ))}
                      </Txt>
                    )}
                  </View>
                  <View style={{ width: 28, paddingTop: 2 }}>
                    {active && (
                      <View style={{ gap: 1 }}>
                        <IconButton
                          icon={Bookmark}
                          active={saved}
                          onPress={() =>
                            useAppStore.getState().toggleBookmark(key)
                          }
                          label={bi(
                            `收藏第 ${v.number} 节`,
                            `Bookmark verse ${v.number}`,
                          )}
                          size={14}
                          style={{ width: 28, height: 26 }}
                        />
                        <IconButton
                          icon={versePlaying ? Pause : Play}
                          active={versePlaying}
                          disabled={chapterOnlyAudio || !available}
                          onPress={() =>
                            verseRecording
                              ? toggleNarration()
                              : playVerse(v.number)
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
                          size={14}
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
                            else playVerse(v.number, true);
                          }}
                          label={bi(
                            `循环第 ${v.number} 节`,
                            `Loop verse ${v.number}`,
                          )}
                          size={14}
                          style={{ width: 28, height: 26 }}
                        />
                        <IconButton
                          icon={MoreHorizontal}
                          onPress={() => setPlaybackOpen(true)}
                          disabled={!available}
                          label={bi(
                            "更多朗读设置",
                            "More reading playback controls",
                          )}
                          size={16}
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
        <AudioControlsDialog
          visible={playbackOpen}
          onClose={() => setPlaybackOpen(false)}
          context={{
            title: `${bi(book.zh, book.en)} ${chapter}`,
            queue: tracks,
            index: selectedTrackIndex,
          }}
        />
        <ChapterPicker
          visible={pickerOpen}
          onClose={() => setPickerOpen(false)}
        />
        <WordDialog selection={selection} onClose={() => setSelection(null)} />
        <Dialog
          visible={typeOpen}
          onClose={() => setTypeOpen(false)}
          title={bi("阅读设置", "Reading settings")}
        >
          <Txt style={{ fontSize: 12, color: c.muted, marginBottom: 13 }}>
            {bi("阅读模式", "Reading mode")}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {(
              [
                ["parallel", bi("中英对照", "Parallel")],
                ["en", "English"],
                ["zh", "中文"],
              ] as const
            ).map(([mode, label]) => (
              <Pill
                key={mode}
                active={readingMode === mode}
                onPress={() => setReadingMode(mode)}
              >
                {label}
              </Pill>
            ))}
          </View>
          <View style={{ height: 25 }} />
          <Txt style={{ fontSize: 12, color: c.muted, marginBottom: 13 }}>
            {bi("经文字号", "Scripture text size")}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {[16, 18, 20, 23, 26].map((size) => (
              <Pill
                key={size}
                active={fontSize === size}
                onPress={() => useAppStore.getState().setFontSize(size)}
              >
                {size} px
              </Pill>
            ))}
          </View>
          <Txt
            style={{
              fontSize: 12,
              color: c.muted,
              marginTop: 25,
              marginBottom: 13,
            }}
          >
            {bi("朗读语言", "Narration language")}
          </Txt>
          <View style={{ flexDirection: "row", gap: 8 }}>
            {(["en", "zh"] as const).map((lang) => (
              <Pill
                key={lang}
                active={audioLocale === lang}
                onPress={() => useAppStore.getState().setAudioLocale(lang)}
              >
                {audioVersionLabel(lang)}
              </Pill>
            ))}
          </View>
          {resourceManifest.resourceSet === "open-provider-v1" &&
            chapterRecording?.timingQuality === "forced-alignment" && (
              <Txt
                style={{
                  color: c.green,
                  fontSize: 11,
                  lineHeight: 19,
                  marginTop: 16,
                }}
              >
                {bi(
                  "本章使用本地补充时间轴：原录音声学对齐，已通过独立识别与停顿检查。",
                  "This chapter uses a locally supplemented timeline, checked against independent recognition and audio pauses.",
                )}
              </Txt>
            )}
          <Txt
            style={{
              color: c.muted,
              fontSize: 11,
              marginTop: 18,
              lineHeight: 20,
            }}
          >
            {isWebsiteResource
              ? bi(
                  "录音与经文已从中英文圣经站点重新下载。英文为 NIV dramatized，中文为 WordProject 普通话真人朗读。已核对的经节使用独立音频，单句循环不会播放到下一节；其余章节可先整章聆听。语言切换在下次点选播放时生效。",
                  "Text and recordings were downloaded afresh from Chinese and English Bible: NIV dramatized and WordProject Mandarin narration. Verified verses use separate audio files for verse looping. Other chapters remain available in full. Language changes apply to the next playback.",
                )
              : bi(
                  "英文使用 BSB 的 Barry Hays 真人录音与配套时间轴；利未记 19 章缺少来源时间轴，采用经独立核对的本地补充。中文使用和合本独立经句合成 MP3；来源合并经节会标明范围。语言切换在下次点选播放时生效。",
                  "English uses BSB human narration by Barry Hays with matching timings; Leviticus 19 uses a locally supplemented and independently checked timeline. Mandarin uses individual synthetic CUV MP3s, with source-merged verses marked. Language changes apply to the next playback.",
                )}
          </Txt>
          <Txt
            style={{
              color: c.muted,
              fontSize: 10,
              lineHeight: 18,
              marginTop: 16,
            }}
          >
            {bi(
              `${englishVersion} / ${resourceManifest.versions.zh.name} · ${narrationDescription.zh}`,
              `${englishVersion} / Chinese Union Version · ${narrationDescription.en}`,
            )}
          </Txt>
        </Dialog>
      </ScrollView>
    </View>
  );
}
