import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  View,
  ScrollView,
  Pressable,
  ImageBackground,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Play,
  Pause,
  Repeat1,
  Bookmark,
  Check,
  Type,
  Leaf,
  Sparkles,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
import { getChapterRecording } from "../../data/audio-repository";
import {
  englishVersion,
  audioVersionLabel,
  resourceManifest,
} from "../../data/resource-info";
import { normalizeWord, localDateKey } from "../../domain/vocabulary";
import { colors as c, fonts, images } from "../../shared/theme";
import {
  Txt,
  Eyebrow,
  IconButton,
  Button,
  Panel,
  Pill,
  Dialog,
} from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { ChapterPicker } from "./ChapterPicker";
import { ReadingAside } from "./ReadingAside";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

export function ReaderScreen() {
  const { width } = useWindowDimensions();
  const wide = width >= 1180;
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
    words = useAppStore((s) => s.words),
    readChapters = useAppStore((s) => s.readChapters);
  const setChapter = useAppStore((s) => s.setChapter),
    setReadingMode = useAppStore((s) => s.setReadingMode),
    notify = useAppStore((s) => s.notify);
  const [pickerOpen, setPickerOpen] = useState(false),
    [typeOpen, setTypeOpen] = useState(false),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null),
    mainY = useRef(0),
    panelY = useRef(0),
    verseY = useRef<Record<string, number>>({});
  const scrollToVerse = useCallback(
    (number: number) => {
      const y = verseY.current[`${bookId}:${chapter}:${number}`];
      if (y !== undefined)
        scrollRef.current?.scrollTo({
          y: Math.max(
            0,
            (mobile ? 25 : 29) + mainY.current + panelY.current + y - 20,
          ),
          animated: true,
        });
    },
    [bookId, chapter, mobile],
  );
  const previousSelection = useRef(selectedVerse);
  useEffect(() => {
    const shouldFollow =
      selectedVerse > 1 || previousSelection.current !== selectedVerse;
    previousSelection.current = selectedVerse;
    if (!shouldFollow) return;
    const frame = requestAnimationFrame(() => scrollToVerse(selectedVerse));
    return () => cancelAnimationFrame(frame);
  }, [selectedVerse, scrollToVerse]);
  const book = bibleRepository.getBook(bookId),
    verses = bibleRepository.getChapter(bookId, chapter);
  const tracks = chapterTracks(bookId, chapter, audioLocale),
    available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const chapterRecording = getChapterRecording(bookId, chapter, audioLocale);
  const alignmentStatus = chapterRecording?.alignmentStatus;
  const chapterPlaying =
    audio.track?.bookId === bookId &&
    audio.track.chapter === chapter &&
    audio.playing;
  const isRead = readChapters[localDateKey()]?.includes(`${bookId}:${chapter}`);
  const allBooks = bibleRepository.listBooks(),
    bookIndex = allBooks.findIndex((b) => b.id === bookId);
  function changeChapter(direction: number) {
    const next = chapter + direction;
    if (next < 1 && bookIndex > 0) {
      const previous = allBooks[bookIndex - 1];
      setChapter(previous.id, previous.chapters.length);
    } else if (next > book.chapters.length && bookIndex < allBooks.length - 1)
      setChapter(allBooks[bookIndex + 1].id, 1);
    else if (next >= 1 && next <= book.chapters.length)
      setChapter(bookId, next);
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
    audio.playQueue(tracks, index);
  }
  const sectionTitle =
    bookId === "psalms" && chapter === 23
      ? bi("耶和华是我的牧者", "The Lord is my shepherd")
      : bookId === "john" && chapter === 1
        ? bi("道成了肉身", "The Word became flesh")
        : bookId === "genesis" && chapter === 1
          ? bi("起初，神创造天地", "In the beginning")
          : bi(
              `${book.zh} · 第 ${chapter} 章`,
              `${book.en} · Chapter ${chapter}`,
            );
  return (
    <ScrollView
      ref={scrollRef}
      key={`${bookId}-${chapter}`}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        padding: mobile ? 19 : 34,
        paddingTop: mobile ? 25 : 29,
        paddingBottom: 45,
      }}
    >
      <View style={{ maxWidth: 1400, width: "100%", alignSelf: "center" }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 26,
          }}
        >
          <View>
            <Eyebrow>{bi("在话语里，遇见安静", "NOURISH YOUR SOUL")}</Eyebrow>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 25 : 29,
                letterSpacing: -0.5,
                marginTop: 9,
              }}
            >
              {bi("把心安放在话语里。", "A little stillness, every day.")}
            </Txt>
          </View>
          {!mobile && (
            <View style={{ alignItems: "flex-end", gap: 5 }}>
              <Txt style={{ color: c.muted, fontSize: 11 }}>
                {new Date().toLocaleDateString(
                  locale === "zh" ? "zh-CN" : "en-US",
                  { month: "long", day: "numeric", weekday: "long" },
                )}
              </Txt>
              <View
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <Leaf size={11} color="#929B85" />
                <Txt style={{ fontSize: 9, color: "#929B85" }}>
                  {bi("今天，也有新的恩典", "New mercies, this morning")}
                </Txt>
              </View>
            </View>
          )}
        </View>
        <View
          onLayout={(e) => {
            mainY.current = e.nativeEvent.layout.y;
          }}
          style={{
            flexDirection: wide ? "row" : "column",
            gap: 26,
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1, width: "100%", minWidth: 0, gap: 24 }}>
            <ImageBackground
              source={images.lake}
              imageStyle={{ borderRadius: 15 }}
              style={{
                height: mobile ? 184 : 165,
                width: "100%",
                overflow: "hidden",
                borderRadius: 15,
              }}
            >
              <LinearGradient
                colors={["rgba(25,48,35,.72)", "rgba(32,48,36,.19)"]}
                start={{ x: 0, y: 0.6 }}
                end={{ x: 1, y: 0 }}
                style={{
                  flex: 1,
                  padding: mobile ? 24 : 29,
                  justifyContent: "center",
                }}
              >
                <View
                  style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
                >
                  <View
                    style={{ width: 17, height: 1, backgroundColor: "#D8E2CC" }}
                  />
                  <Eyebrow color="#DBE4D1">PAUSE. BREATHE. BE PRESENT.</Eyebrow>
                </View>
                <Txt
                  style={{
                    fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                    fontSize: mobile ? 27 : 32,
                    lineHeight: mobile ? 40 : 47,
                    color: "#fff",
                    marginTop: 12,
                  }}
                >
                  {bi(
                    mobile ? "静下来，\n听见恩典。" : "静下来，听见恩典。",
                    mobile
                      ? "Be still.\nLet the Word speak."
                      : "Be still. Let the Word speak.",
                  )}
                </Txt>
                <Txt style={{ color: "#E3E8DD", fontSize: 11, marginTop: 13 }}>
                  {bi(
                    "你的话是我脚前的灯，是我路上的光。",
                    "Your word is a lamp for my feet, a light on my path.",
                  )}
                </Txt>
                <Txt
                  style={{
                    position: "absolute",
                    right: 24,
                    bottom: 23,
                    color: "#E3E8DD",
                    fontSize: 9,
                    letterSpacing: 1,
                  }}
                >
                  {bi("诗篇 119:105", "PSALM 119:105")}
                </Txt>
              </LinearGradient>
            </ImageBackground>
            <Panel
              onLayout={(e) => {
                panelY.current = e.nativeEvent.layout.y;
              }}
              style={{ overflow: "hidden" }}
            >
              <View
                style={{
                  paddingHorizontal: mobile ? 17 : 25,
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
                  accessibilityLabel={bi(
                    "选择书卷章节",
                    "Choose book and chapter",
                  )}
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
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: mobile ? 1 : 7,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      backgroundColor: c.bg,
                      borderRadius: 8,
                      padding: 3,
                    }}
                  >
                    {(
                      [
                        ["parallel", bi("中英对照", "Parallel")],
                        ["en", "EN"],
                        ["zh", "中文"],
                      ] as const
                    ).map(([mode, label]) => (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        key={mode}
                        onPress={() => setReadingMode(mode)}
                        style={{
                          backgroundColor:
                            readingMode === mode ? "#fff" : "transparent",
                          borderRadius: 6,
                          paddingHorizontal: mobile ? 9 : 11,
                          paddingVertical: 7,
                          boxShadow:
                            readingMode === mode
                              ? "0 1px 4px #00000008"
                              : undefined,
                        }}
                      >
                        <Txt
                          style={{
                            fontSize: 10,
                            color: readingMode === mode ? c.green : c.muted,
                            fontFamily:
                              readingMode === mode ? fonts.bold : fonts.regular,
                          }}
                        >
                          {label}
                        </Txt>
                      </Pressable>
                    ))}
                  </View>
                  <IconButton
                    icon={Type}
                    onPress={() => setTypeOpen(true)}
                    label={bi("阅读设置", "Reading settings")}
                    size={17}
                    style={{ width: 31 }}
                  />
                </View>
              </View>
              <View
                style={{
                  paddingHorizontal: mobile ? 20 : 32,
                  paddingTop: 21,
                  paddingBottom: 16,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Eyebrow>
                      {book.en.toUpperCase()} ·{" "}
                      {bi(`第 ${chapter} 章`, `CHAPTER ${chapter}`)}
                    </Eyebrow>
                    <Txt
                      style={{
                        fontFamily:
                          locale === "en" ? fonts.serif : fonts.regular,
                        fontSize: mobile ? 21 : 25,
                        lineHeight: 36,
                        marginTop: 10,
                      }}
                    >
                      {sectionTitle}
                    </Txt>
                  </View>
                  <IconButton
                    icon={chapterPlaying ? Pause : Headphones}
                    active={chapterPlaying}
                    onPress={() =>
                      chapterPlaying
                        ? audio.toggle()
                        : playVerse(selectedVerse, false, true)
                    }
                    label={
                      chapterPlaying
                        ? bi("暂停朗读", "Pause chapter")
                        : bi("朗读本章", "Listen to chapter")
                    }
                    size={20}
                    style={{
                      backgroundColor: c.lightGreen,
                      width: 42,
                      height: 42,
                      borderRadius: 23,
                    }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    gap: 6,
                    alignItems: "center",
                    marginTop: 15,
                  }}
                >
                  <Sparkles size={11} color="#9DA38F" />
                  <Txt style={{ color: "#929988", fontSize: 10 }}>
                    {bi(
                      "点词学习 · 点句聆听 · 循环默想",
                      "Tap a word to learn · Tap a verse to listen",
                    )}
                  </Txt>
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
                {chapterOnlyAudio && (
                  <View
                    style={{
                      marginTop: 16,
                      padding: 12,
                      backgroundColor: c.sand,
                      borderRadius: 8,
                    }}
                  >
                    <Txt
                      style={{ color: c.gold, fontSize: 11, lineHeight: 19 }}
                    >
                      {alignmentStatus === "pending"
                        ? bi(
                            "本章正在重新对齐，可先整章聆听。",
                            "Verse alignment is pending. Listen to the full chapter for now.",
                          )
                        : resourceManifest.resourceSet === "open-provider-v1"
                          ? bi(
                              "来源尚未提供本章的逐节时间轴，可整章聆听。",
                              "The provider has no verse timings for this chapter. Full chapter playback is available.",
                            )
                          : bi(
                              "本章录音疑似有措辞或定位差异，核对期间仅整章播放。",
                              "Audio and text need further review. Full chapter playback is available.",
                            )}
                    </Txt>
                  </View>
                )}
                {!available && (
                  <View
                    style={{
                      marginTop: 16,
                      padding: 12,
                      backgroundColor: c.sand,
                      borderRadius: 8,
                    }}
                  >
                    <Txt
                      style={{ color: c.gold, fontSize: 11, lineHeight: 19 }}
                    >
                      {bi(
                        "经文可继续阅读；请配置资源服务以播放本章录音。",
                        "You can keep reading. Configure the resource server to listen to this chapter.",
                      )}
                    </Txt>
                  </View>
                )}
              </View>
              {verses.map((v) => {
                const key = `${bookId}:${chapter}:${v.number}`,
                  saved = bookmarks.includes(key),
                  active = chapterPlaying
                    ? audio.track?.verse === v.number
                    : selectedVerse === v.number;
                return (
                  <View
                    key={v.number}
                    onLayout={(e) => {
                      verseY.current[key] = e.nativeEvent.layout.y;
                      if (v.number === selectedVerse && selectedVerse > 1)
                        requestAnimationFrame(() => scrollToVerse(v.number));
                    }}
                    style={{
                      backgroundColor: active ? "#F0F4EB" : "#fff",
                      borderLeftWidth: 3,
                      borderLeftColor: active ? "#7B9365" : "transparent",
                      paddingLeft: mobile ? 15 : 27,
                      paddingRight: mobile ? 12 : 23,
                      paddingVertical: 20,
                    }}
                  >
                    <View
                      style={{ flexDirection: "row", gap: mobile ? 10 : 17 }}
                    >
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={bi(
                          `播放第 ${v.number} 节`,
                          `Play verse ${v.number}`,
                        )}
                        onPress={() => playVerse(v.number)}
                        disabled={chapterOnlyAudio || !available}
                        style={{
                          paddingTop: 5,
                          width: 15,
                          alignItems: "center",
                        }}
                      >
                        {active && chapterPlaying ? (
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
                              lineHeight: fontSize * 1.85,
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
                                known = words.some(
                                  (w) => w.word === normalized,
                                );
                              return (
                                <Txt
                                  key={i}
                                  onPress={
                                    normalized
                                      ? () => {
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
                                    lineHeight: fontSize * 1.85,
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
                                readingMode === "zh" ? fontSize * 1.9 : 25,
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
                        {active && !chapterOnlyAudio && available && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 9,
                              marginTop: 12,
                            }}
                          >
                            <Pressable
                              accessibilityRole="button"
                              accessibilityLabel={bi(
                                `循环第 ${v.number} 节`,
                                `Loop verse ${v.number}`,
                              )}
                              onPress={() => playVerse(v.number, true)}
                              style={{
                                flexDirection: "row",
                                alignItems: "center",
                                gap: 5,
                                paddingVertical: 4,
                              }}
                            >
                              <Repeat1 size={12} color={c.green} />
                              <Txt style={{ fontSize: 10, color: c.green }}>
                                {bi(
                                  "反复聆听这一句",
                                  "Listen to this verse again",
                                )}
                              </Txt>
                            </Pressable>
                            <View
                              style={{
                                width: 1,
                                height: 10,
                                backgroundColor: "#D6DEC9",
                                marginHorizontal: 4,
                              }}
                            />
                            <Txt style={{ fontSize: 9, color: "#9BA58F" }}>
                              {audioLocale === "en"
                                ? `${englishVersion} · ENGLISH`
                                : bi("中文录音", "CHINESE AUDIO")}
                            </Txt>
                          </View>
                        )}
                      </View>
                      <View style={{ width: 25, gap: 2, paddingTop: 2 }}>
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
                          size={13}
                          style={{ width: 25, height: 28 }}
                        />
                        <IconButton
                          icon={Play}
                          active={active && chapterPlaying}
                          disabled={chapterOnlyAudio || !available}
                          onPress={() => playVerse(v.number)}
                          label={bi(
                            `朗读第 ${v.number} 节`,
                            `Listen to verse ${v.number}`,
                          )}
                          size={12}
                          style={{ width: 25, height: 28 }}
                        />
                      </View>
                    </View>
                  </View>
                );
              })}
              <View
                style={{
                  marginTop: 10,
                  paddingHorizontal: 25,
                  paddingVertical: 23,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  borderTopWidth: 1,
                  borderColor: c.border,
                }}
              >
                <IconButton
                  icon={ChevronLeft}
                  onPress={() => changeChapter(-1)}
                  disabled={bookIndex === 0 && chapter === 1}
                  label={bi("上一章", "Previous chapter")}
                />
                <Button
                  secondary
                  small
                  icon={isRead ? Check : BookOpen}
                  onPress={() => {
                    useAppStore.getState().markRead();
                    notify(
                      bi(
                        "今天，又让话语在心里扎了根。",
                        "Another chapter, another little root.",
                      ),
                    );
                  }}
                >
                  {isRead
                    ? bi("今日已读", "Read today")
                    : bi("标记本章已读", "Mark chapter as read")}
                </Button>
                <IconButton
                  icon={ChevronRight}
                  onPress={() => changeChapter(1)}
                  disabled={
                    bookIndex === 65 && chapter === book.chapters.length
                  }
                  label={bi("下一章", "Next chapter")}
                />
              </View>
            </Panel>
            <Txt
              style={{
                fontSize: 9,
                color: "#AAAEA0",
                lineHeight: 18,
                textAlign: "center",
              }}
            >
              {bi(
                `${englishVersion} / ${resourceManifest.versions.zh.name} · 英文真人朗读，中文逐节合成朗读`,
                `${englishVersion} / Chinese Union Version · English human narration; Mandarin verse-by-verse synthetic narration`,
              )}
            </Txt>
          </View>
          {wide && (
            <View style={{ width: 276 }}>
              <ReadingAside />
            </View>
          )}
        </View>
        {!wide && (
          <View style={{ marginTop: 25 }}>
            <ReadingAside />
          </View>
        )}
      </View>
      <ChapterPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
      />
      <WordDialog selection={selection} onClose={() => setSelection(null)} />
      <Dialog
        visible={typeOpen}
        onClose={() => setTypeOpen(false)}
        title={bi("舒服地读，安静地听", "Make yourself at home")}
      >
        <Txt style={{ fontSize: 12, color: c.muted, marginBottom: 13 }}>
          {bi("经文字号", "Scripture text size")}
        </Txt>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {[18, 20, 23, 26].map((size) => (
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
        <Txt
          style={{
            color: c.muted,
            fontSize: 11,
            marginTop: 18,
            lineHeight: 20,
          }}
        >
          {bi(
            "英文使用 BSB 的 Barry Hays 真人录音与配套时间轴；利未记 19 章缺少来源时间轴，采用经独立核对的本地补充。中文使用和合本独立经句合成 MP3；来源合并经节会标明范围。语言切换在下次点选播放时生效。",
            "English uses BSB human narration by Barry Hays with matching timings; Leviticus 19 uses a locally supplemented and independently checked timeline. Mandarin uses individual synthetic CUV MP3s, with source-merged verses marked. Language changes apply to the next playback.",
          )}
        </Txt>
      </Dialog>
    </ScrollView>
  );
}
