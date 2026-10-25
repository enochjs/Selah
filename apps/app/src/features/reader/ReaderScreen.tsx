import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useContext,
} from "react";
import {
  View,
  Animated,
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
  ArrowLeftRight,
  Bookmark,
  Type,
  Search,
  Settings,
  MoreHorizontal,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, IconButton, Pill, Dialog } from "../../shared/ui";
import { ShellActionsContext } from "../../shared/shell-actions-context";
import { ReaderBrand } from "../../shared/Brand";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { matchesVerseAudio } from "../../domain/scripture-audio";
import { ChapterPicker } from "./ChapterPicker";
import { VerseText } from "./VerseText";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

import {
  adjacentChapter,
  captureChapterSwipe,
  chapterSwipe,
  narrationVerseToFollow,
} from "../../domain/reading";
import { useReadingProgress } from "./useReadingProgress";
import { hasTextSelection, useChapterKeyboard } from "./reader-input";
import { useChapterMotion } from "./useChapterMotion";

export function ReaderScreen() {
  const hydrated = useAppStore((s) => s.hydrated);
  const bookId = useAppStore((s) => s.bookId);
  const chapter = useAppStore((s) => s.chapter);
  const chapterKey = `${bookId}:${chapter}`;
  const motion = useChapterMotion(chapterKey);
  return hydrated ? <ReaderChapter key={chapterKey} motion={motion} /> : null;
}

function ReaderChapter({
  motion,
}: {
  motion: ReturnType<typeof useChapterMotion>;
}) {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const { openSearch, openBookmarks, dialogOpen } =
    useContext(ShellActionsContext);
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const bookId = useAppStore((s) => s.bookId),
    chapter = useAppStore((s) => s.chapter),
    primaryLocale = useAppStore((s) => s.primaryLocale);
  const showTranslation = useAppStore((s) => s.showTranslation),
    lineHeight = useAppStore((s) => s.lineHeight);
  const selectedVerse = useAppStore((s) => s.selectedVerse),
    fontSize = useAppStore((s) => s.fontSize);
  const bookmarks = useAppStore((s) => s.bookmarks),
    words = useAppStore((s) => s.words);
  const setChapter = useAppStore((s) => s.setChapter),
    setPrimaryLocale = useAppStore((s) => s.setPrimaryLocale),
    setShowTranslation = useAppStore((s) => s.setShowTranslation),
    notify = useAppStore((s) => s.notify);
  const [pickerView, setPickerView] = useState<"books" | "chapters" | null>(
      null,
    ),
    [typeOpen, setTypeOpen] = useState(false),
    [moreOpen, setMoreOpen] = useState(false),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const afterMoreClose = useRef<(() => void) | null>(null);
  function selectMoreAction(action: () => void) {
    afterMoreClose.current = action;
    setMoreOpen(false);
  }
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
    followingNarration,
    scrollToVerse,
    isForeground,
  ]);
  const book = bibleRepository.getBook(bookId),
    verses = bibleRepository.getChapter(bookId, chapter);
  const tracks = chapterTracks(bookId, chapter, primaryLocale),
    available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const playingTrackIndex = tracks.findIndex(
    (track) => track.id === audio.track?.id,
  );
  const selectedTrackIndex =
    playingTrackIndex >= 0
      ? playingTrackIndex
      : chapterOnlyAudio
        ? 0
        : tracks.findIndex(
            (track) =>
              track.verse === selectedVerse ||
              track.coveredVerses?.includes(selectedVerse),
          );
  const chapterLoaded =
    audio.track?.kind === "scripture" &&
    audio.track.bookId === bookId &&
    audio.track.chapter === chapter &&
    audio.track.locale === primaryLocale;
  const chapterPlaying = chapterLoaded && audio.playing;
  const allBooks = bibleRepository.listBooks();
  const previous = adjacentChapter(allBooks, bookId, chapter, -1);
  const next = adjacentChapter(allBooks, bookId, chapter, 1);
  const changeChapter = useCallback(
    (direction: -1 | 1) => {
      const target = adjacentChapter(allBooks, bookId, chapter, direction);
      if (!target) return;
      motion.turn(
        `${target.bookId}:${target.chapter}`,
        direction,
        width,
        () => {
          flush();
          setChapter(target.bookId, target.chapter);
        },
      );
    },
    [allBooks, bookId, chapter, setChapter, flush, motion, width],
  );
  const interactionBlocked =
    pickerView !== null ||
    typeOpen ||
    moreOpen ||
    dialogOpen ||
    selection !== null;
  useChapterKeyboard(!mobile && !interactionBlocked, changeChapter);
  const touch = useRef({ x: 0, y: 0, at: 0, cancelled: false });
  function startSwipe(event: GestureResponderEvent) {
    const { pageX, pageY, timestamp, touches } = event.nativeEvent;
    touch.current = {
      x: pageX,
      y: pageY,
      at: timestamp,
      cancelled: touches.length !== 1,
    };
    return false;
  }
  function captureSwipe(event: GestureResponderEvent) {
    const { pageX, pageY, timestamp, touches } = event.nativeEvent;
    return (
      mobile &&
      !motion.busy &&
      !touch.current.cancelled &&
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
  function moveSwipe(event: GestureResponderEvent) {
    if (
      touch.current.cancelled ||
      interactionBlocked ||
      hasTextSelection() ||
      event.nativeEvent.touches.length > 1
    ) {
      touch.current.cancelled = true;
      motion.settle();
      return;
    }
    motion.drag(
      event.nativeEvent.pageX - touch.current.x,
      width,
      !!previous,
      !!next,
    );
  }
  function finishSwipe(event: GestureResponderEvent) {
    if (touch.current.cancelled || interactionBlocked || hasTextSelection()) {
      motion.settle();
      return;
    }
    const { pageX, pageY, timestamp } = event.nativeEvent;
    const direction = chapterSwipe(
      pageX - touch.current.x,
      pageY - touch.current.y,
      timestamp - touch.current.at,
    );
    if (direction && (direction === -1 ? previous : next))
      changeChapter(direction);
    else motion.settle();
  }
  function playVerse(number: number, loop = false) {
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
    useAppStore.getState().setFollowingNarration(true);
    audio.playQueue(tracks, index);
  }
  function toggleNarration() {
    useAppStore.getState().setFollowingNarration(true);
    audio.toggle();
  }
  function toggleChapterNarration() {
    if (chapterLoaded) {
      toggleNarration();
      return;
    }
    if (!available) {
      notify(
        bi(
          "无法读取本章音频，请检查资源服务地址与连接。",
          "Chapter audio is unavailable. Check the resource server connection.",
        ),
      );
      return;
    }
    useAppStore.getState().setFollowingNarration(true);
    audio.playQueue(tracks, Math.max(0, selectedTrackIndex));
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
    <View style={{ flex: 1, minHeight: 0 }}>
      <View
        style={{
          paddingHorizontal: mobile ? 8 : 0,
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
          backgroundColor: c.bg,
          paddingVertical: 6,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          borderBottomWidth: 1,
          borderColor: c.border,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            gap: mobile ? 10 : 0,
          }}
        >
          {mobile && <ReaderBrand showName={width >= 380} />}
          {!mobile && (
            <IconButton
              icon={ChevronLeft}
              onPress={() => changeChapter(-1)}
              disabled={!previous}
              label={bi("上一章", "Previous chapter")}
              style={{ width: 32 }}
            />
          )}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              borderRadius: mobile ? 10 : 0,
              backgroundColor: mobile ? c.sidebar : "transparent",
              flexShrink: 1,
              minWidth: 0,
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("选择书卷", "Choose a book")}
              onPress={() => setPickerView("books")}
              style={{
                flexDirection: "row",
                gap: 7,
                alignItems: "center",
                paddingHorizontal: mobile ? 10 : 4,
                minHeight: 44,
                flexShrink: 1,
                minWidth: 0,
              }}
            >
              {!mobile && <BookOpen size={18} color={c.green} />}
              <Txt
                numberOfLines={1}
                style={{ fontFamily: fonts.bold, fontSize: 13, flexShrink: 1 }}
              >
                {bi(book.zh, book.en)}
              </Txt>
              {!mobile && <ChevronDown size={13} color={c.muted} />}
            </Pressable>
            <View style={{ width: 1, height: 16, backgroundColor: c.border }} />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("选择章节", "Choose a chapter")}
              onPress={() => setPickerView("chapters")}
              style={{
                minWidth: 40,
                minHeight: 44,
                paddingHorizontal: 8,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Txt style={{ fontFamily: fonts.bold, fontSize: 13 }}>
                {chapter}
              </Txt>
            </Pressable>
          </View>
          {!mobile && (
            <IconButton
              icon={ChevronRight}
              onPress={() => changeChapter(1)}
              disabled={!next}
              label={bi("下一章", "Next chapter")}
              style={{ width: 32 }}
            />
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexShrink: 0,
            gap: 0,
          }}
        >
          <IconButton
            icon={chapterPlaying ? Pause : Headphones}
            active={chapterPlaying}
            onPress={toggleChapterNarration}
            label={
              chapterPlaying
                ? bi("暂停朗读", "Pause narration")
                : chapterLoaded
                  ? bi("继续朗读", "Resume narration")
                  : bi("朗读本章", "Read chapter aloud")
            }
            size={18}
            style={{ width: mobile ? 40 : 32, height: 44 }}
          />
          {!mobile && (
            <>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  primaryLocale === "zh"
                    ? bi(
                        "中文主读，切换为英文主读",
                        "Chinese primary, switch to English",
                      )
                    : bi(
                        "英文主读，切换为中文主读",
                        "English primary, switch to Chinese",
                      )
                }
                onPress={() =>
                  setPrimaryLocale(primaryLocale === "zh" ? "en" : "zh")
                }
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 4,
                  minHeight: 38,
                  paddingHorizontal: 5,
                }}
              >
                <Txt style={{ fontSize: 11, color: c.green }}>
                  {primaryLocale === "zh"
                    ? bi("中文主读", "中文")
                    : bi("英文主读", "EN")}
                </Txt>
                <ArrowLeftRight size={12} color={c.green} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bi("阅读设置", "Reading settings")}
                onPress={() => setTypeOpen(true)}
                style={{
                  flexDirection: "row",
                  gap: 6,
                  alignItems: "center",
                  minHeight: 38,
                  minWidth: 32,
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
            </>
          )}
          {mobile && (
            <IconButton
              icon={MoreHorizontal}
              onPress={() => setMoreOpen(true)}
              label={bi("更多", "More")}
              size={20}
              style={{ width: 40, height: 44 }}
            />
          )}
        </View>
      </View>
      <View
        style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
        onStartShouldSetResponderCapture={startSwipe}
        onMoveShouldSetResponderCapture={captureSwipe}
        onResponderGrant={moveSwipe}
        onResponderStart={(event) => {
          if (event.nativeEvent.touches.length > 1) {
            touch.current.cancelled = true;
            motion.settle();
          }
        }}
        onResponderMove={moveSwipe}
        onResponderRelease={finishSwipe}
        onResponderTerminate={() => {
          touch.current.cancelled = true;
          motion.settle();
        }}
        onResponderTerminationRequest={() => true}
      >
        <Animated.ScrollView
          pointerEvents={motion.busy ? "none" : "auto"}
          style={motion.style}
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
                      <VerseText
                        verse={v}
                        chapter={chapter}
                        primaryLocale={primaryLocale}
                        showTranslation={showTranslation}
                        fontSize={fontSize}
                        lineHeight={lineHeight}
                        active={active}
                        words={words}
                        onWord={(word) => {
                          useAppStore.getState().setSelectedVerse(v.number);
                          setSelection({
                            word,
                            reference: `${book.en} ${chapter}:${v.number}`,
                            context: v.en,
                          });
                        }}
                        onChinesePress={
                          chapterOnlyAudio || !available
                            ? undefined
                            : () => playVerse(v.number)
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
                              else playVerse(v.number, true);
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
        </Animated.ScrollView>
      </View>
      <ChapterPicker
        visible={pickerView !== null}
        initialView={pickerView ?? "chapters"}
        onBeforeNavigate={flush}
        onClose={() => setPickerView(null)}
      />
      <WordDialog selection={selection} onClose={() => setSelection(null)} />
      <Dialog
        visible={moreOpen}
        onClose={() => setMoreOpen(false)}
        onDismiss={() => {
          const action = afterMoreClose.current;
          afterMoreClose.current = null;
          action?.();
        }}
        title={bi("更多", "More")}
        presentation="bottom"
        bodyStyle={{ padding: 12, paddingBottom: 28 }}
      >
        {[
          {
            icon: Search,
            label: bi("搜索经文", "Search Scripture"),
            action: openSearch,
          },
          {
            icon: Bookmark,
            label: bi("珍藏的经文", "Saved verses"),
            action: openBookmarks,
          },
          {
            icon: Settings,
            label: bi("设置", "Settings"),
            action: () => {
              flush();
              router.push("/settings");
            },
          },
        ].map(({ icon: Icon, label, action }) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityLabel={label}
            onPress={() => selectMoreAction(action)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingHorizontal: 14,
              paddingVertical: 16,
              borderRadius: 10,
              backgroundColor: pressed ? c.sidebar : "transparent",
            })}
          >
            <Icon size={20} color={c.green} strokeWidth={1.6} />
            <Txt>{label}</Txt>
          </Pressable>
        ))}
      </Dialog>
      <Dialog
        visible={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={bi("阅读设置", "Reading settings")}
      >
        <Txt style={{ fontSize: 12, color: c.muted, marginBottom: 13 }}>
          {bi("对照文字", "Translation")}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {([true, false] as const).map((show) => (
            <Pill
              key={String(show)}
              active={showTranslation === show}
              onPress={() => setShowTranslation(show)}
            >
              {show ? bi("显示", "Show") : bi("隐藏", "Hide")}
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
          {bi("行距", "Line spacing")}
        </Txt>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {(
            [
              [1.4, bi("紧凑", "Compact")],
              [1.6, bi("标准", "Standard")],
              [1.8, bi("宽松", "Relaxed")],
            ] as const
          ).map(([height, label]) => (
            <Pill
              key={height}
              active={lineHeight === height}
              onPress={() => useAppStore.getState().setLineHeight(height)}
            >
              {label}
            </Pill>
          ))}
        </View>
      </Dialog>
    </View>
  );
}
