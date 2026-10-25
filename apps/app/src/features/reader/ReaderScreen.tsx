import React, { useState, useRef, useCallback, useContext } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import {
  BookOpen,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Headphones,
  Pause,
  Bookmark,
  Search,
  Settings,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, IconButton, Dialog } from "../../shared/ui";
import { ShellActionsContext } from "../../shared/shell-actions-context";
import { ReaderBrand } from "../../shared/Brand";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { ChapterPicker } from "./ChapterPicker";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

import { adjacentChapter } from "../../domain/reading";
import { useChapterKeyboard } from "./reader-input";
import { ChapterPager } from "./ChapterPager";
import { chapterPages } from "./chapter-pagination";
import type { ChapterPagerHandle } from "./chapter-pager-props";
import { ReaderPage, type ReaderPageHandle } from "./ReaderPage";
import { useReaderBackGuard } from "./useReaderBackGuard";

const pages = chapterPages(bibleRepository.listBooks());

export function ReaderScreen() {
  const hydrated = useAppStore((s) => s.hydrated);
  return hydrated ? <ReaderChapter /> : null;
}

function ReaderChapter() {
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const { openSearch, openBookmarks, dialogOpen } =
    useContext(ShellActionsContext);
  const { bi } = useI18n();
  const audio = useAudio();
  const bookId = useAppStore((s) => s.bookId),
    chapter = useAppStore((s) => s.chapter),
    primaryLocale = useAppStore((s) => s.primaryLocale);
  const selectedVerse = useAppStore((s) => s.selectedVerse);
  const setChapter = useAppStore((s) => s.setChapter),
    notify = useAppStore((s) => s.notify);
  const [pickerView, setPickerView] = useState<"books" | "chapters" | null>(
      null,
    ),
    [moreOpen, setMoreOpen] = useState(false),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const afterMoreClose = useRef<(() => void) | null>(null);
  function selectMoreAction(action: () => void) {
    afterMoreClose.current = action;
    setMoreOpen(false);
  }
  const currentPage = useRef<ReaderPageHandle>(null);
  const pagerRef = useRef<ChapterPagerHandle>(null);
  const flush = useCallback(() => currentPage.current?.flush(), []);
  const book = bibleRepository.getBook(bookId);
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
  const pageIndex = pages.findIndex(
    (page) => page.bookId === bookId && page.chapter === chapter,
  );
  const changeChapter = useCallback(
    (direction: -1 | 1) => pagerRef.current?.turn(direction),
    [],
  );
  const interactionBlocked =
    pickerView !== null || moreOpen || dialogOpen || selection !== null;
  useChapterKeyboard(!mobile && !interactionBlocked, changeChapter);
  useReaderBackGuard(`${bookId}:${chapter}`, !interactionBlocked);
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
          />
          {!mobile && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("设置", "Settings")}
              onPress={() => {
                flush();
                router.push("/settings");
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
                paddingHorizontal: 8,
              }}
            >
              <Settings size={18} color={c.muted} />
              <Txt style={{ fontSize: 13, color: c.muted }}>
                {bi("设置", "Settings")}
              </Txt>
            </Pressable>
          )}
          {mobile && (
            <IconButton
              icon={MoreHorizontal}
              onPress={() => setMoreOpen(true)}
              label={bi("更多", "More")}
              size={20}
            />
          )}
        </View>
      </View>
      <ChapterPager
        ref={pagerRef}
        pages={pages}
        index={pageIndex}
        enabled={!interactionBlocked}
        onBeforeChange={flush}
        onSelect={(page) => setChapter(page.bookId, page.chapter)}
        renderPage={(page, current) => (
          <ReaderPage
            key={`${page.bookId}:${page.chapter}`}
            {...page}
            current={current}
            ref={current ? currentPage : undefined}
            onWord={setSelection}
            onPlay={playVerse}
            onToggleNarration={toggleNarration}
          />
        )}
      />
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
        heightMode="content"
        bodyStyle={{ padding: 12, paddingBottom: 16 }}
      >
        <MoreActionRow
          icon={Search}
          label={bi("搜索经文", "Search Scripture")}
          onPress={() => selectMoreAction(openSearch)}
        />
        <MoreActionRow
          icon={Bookmark}
          label={bi("珍藏的经文", "Saved verses")}
          onPress={() => selectMoreAction(openBookmarks)}
        />
        <MoreActionRow
          icon={Settings}
          label={bi("设置", "Settings")}
          onPress={() =>
            selectMoreAction(() => {
              flush();
              router.push("/settings");
            })
          }
        />
      </Dialog>
    </View>
  );
}

function MoreActionRow({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
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
  );
}
