import React, { useState, useRef, useEffect, useCallback } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
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
  Check,
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
import { normalizeWord, localDateKey } from "../../domain/vocabulary";
import { colors as c, fonts } from "../../shared/theme";
import {
  Txt,
  Eyebrow,
  IconButton,
  Button,
  Pill,
  Dialog,
} from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { AudioControlsDialog } from "../audio/AudioControlsDialog";
import { matchesVerseAudio } from "../../domain/scripture-audio";
import { ChapterPicker } from "./ChapterPicker";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

export function ReaderScreen() {
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
    words = useAppStore((s) => s.words),
    readChapters = useAppStore((s) => s.readChapters);
  const setChapter = useAppStore((s) => s.setChapter),
    setReadingMode = useAppStore((s) => s.setReadingMode),
    notify = useAppStore((s) => s.notify);
  const [pickerOpen, setPickerOpen] = useState(false),
    [typeOpen, setTypeOpen] = useState(false),
    [playbackOpen, setPlaybackOpen] = useState(false),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null),
    verseY = useRef<Record<string, number>>({});
  const scrollToVerse = useCallback(
    (number: number) => {
      const y = verseY.current[`${bookId}:${chapter}:${number}`];
      if (number === 1 || y !== undefined)
        scrollRef.current?.scrollTo({
          y: number === 1 ? 0 : Math.max(0, (y ?? 0) - 20),
          animated: true,
        });
    },
    [bookId, chapter],
  );
  useEffect(() => {
    const frame = requestAnimationFrame(() => scrollToVerse(selectedVerse));
    return () => cancelAnimationFrame(frame);
  }, [selectedVerse, scrollToVerse]);
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
      onContentSizeChange={() => scrollToVerse(selectedVerse)}
      contentContainerStyle={{
        paddingHorizontal: mobile ? 16 : 34,
        paddingBottom: 45,
      }}
    >
      <View
        style={{
          maxWidth: 760,
          width: "100%",
          alignSelf: "center",
          paddingTop: mobile ? 20 : 29,
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi("阅读设置", "Reading settings")}
            onPress={() => setTypeOpen(true)}
            style={{
              flexDirection: "row",
              gap: 6,
              alignItems: "center",
              minHeight: 38,
              paddingHorizontal: 5,
            }}
          >
            <Type size={17} color={c.muted} />
            <Txt style={{ fontSize: 11, color: c.muted }}>
              {bi("阅读设置", "Reading settings")}
            </Txt>
          </Pressable>
        </View>
        <View
          style={{
            paddingHorizontal: 0,
            paddingTop: 21,
            paddingBottom: 20,
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
                  fontFamily: locale === "en" ? fonts.serif : fonts.regular,
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
          {chapterOnlyAudio && (
            <View
              style={{
                marginTop: 16,
                padding: 12,
                backgroundColor: c.sand,
                borderRadius: 8,
              }}
            >
              <Txt style={{ color: c.gold, fontSize: 11, lineHeight: 19 }}>
                {alignmentStatus === "pending"
                  ? bi(
                      "本章尚待逐节核对，可先整章聆听。",
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
              <Txt style={{ color: c.gold, fontSize: 11, lineHeight: 19 }}>
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
              onPress={() => useAppStore.getState().setSelectedVerse(v.number)}
              key={v.number}
              onLayout={(e) => {
                verseY.current[key] = e.nativeEvent.layout.y;
                if (v.number === selectedVerse && selectedVerse > 1)
                  requestAnimationFrame(() => scrollToVerse(v.number));
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
                              textDecorationLine: known ? "underline" : "none",
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
                        lineHeight: readingMode === "zh" ? fontSize * 1.65 : 21,
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
                          verseRecording ? audio.toggle() : playVerse(v.number)
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
              bookIndex === allBooks.length - 1 &&
              chapter === book.chapters.length
            }
            label={bi("下一章", "Next chapter")}
          />
        </View>
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
  );
}
