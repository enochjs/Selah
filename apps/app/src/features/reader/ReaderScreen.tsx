import React, {
  useState,
  useRef,
  useCallback,
  useContext,
  useMemo,
  useLayoutEffect,
} from "react";
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
  Repeat1,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, IconButton } from "../../shared/ui";
import { ShellActionsContext } from "../../shared/shell-actions-context";
import { ReaderBrand } from "../../shared/Brand";
import { useI18n } from "../../shared/i18n";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { getChapterRecording } from "../../data/audio-repository";
import {
  isVerseMissing,
  matchesVerseAudio,
} from "../../domain/scripture-audio";
import { ChapterPicker } from "./ChapterPicker";
import { WordDialog, type WordSelection } from "../vocabulary/WordDialog";

import { adjacentChapter } from "../../domain/reading";
import { useChapterKeyboard } from "./reader-input";
import { ChapterPager } from "./ChapterPager";
import { chapterPages, type ChapterPage } from "./chapter-pagination";
import type { ChapterPagerHandle } from "./chapter-pager-props";
import { ReaderPage, type ReaderPageHandle } from "./ReaderPage";
import { useReaderBackGuard } from "./useReaderBackGuard";
import { readerToolbarHeight } from "./reader-layout";

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
  const { playQueue, setRepeat, toggle } = audio;
  const bookId = useAppStore((s) => s.bookId),
    chapter = useAppStore((s) => s.chapter),
    primaryLocale = useAppStore((s) => s.primaryLocale);
  const showTranslation = useAppStore((s) => s.showTranslation);
  const cycleReadingContent = useAppStore((s) => s.cycleReadingContent);
  const selectedVerse = useAppStore((s) => s.selectedVerse);
  const followingNarration = useAppStore((s) => s.followingNarration);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const readerChromeHidden = useAppStore((s) => s.readerChromeHidden);
  const setReaderChromeHidden = useAppStore((s) => s.setReaderChromeHidden);
  const chapterKey = `${bookId}:${chapter}`;
  const openReadingPosition = useAppStore((s) => s.openReadingPosition),
    notify = useAppStore((s) => s.notify);
  const [pickerView, setPickerView] = useState<"books" | "chapters" | null>(
      null,
    ),
    [selection, setSelection] = useState<WordSelection | null>(null);
  const currentPage = useRef<ReaderPageHandle>(null);
  const pagerRef = useRef<ChapterPagerHandle>(null);
  const flush = useCallback(() => currentPage.current?.flush(), []);
  const contentLabel = showTranslation
    ? primaryLocale === "zh"
      ? "中英"
      : "英中"
    : primaryLocale === "zh"
      ? "中"
      : "英";
  function cycleContent() {
    flush();
    currentPage.current?.preservePosition();
    // 中 → 英 → 中英 → 英中 → 中. Keep using the persisted reading preferences.
    cycleReadingContent();
  }
  const book = bibleRepository.getBook(bookId);
  const tracks = useMemo(
    () => chapterTracks(bookId, chapter, primaryLocale),
    [bookId, chapter, primaryLocale],
  );
  const available = tracks.length > 0;
  const chapterOnlyAudio = tracks.length === 1 && tracks[0].verse === undefined;
  const chapterLoaded =
    audio.track?.kind === "scripture" &&
    audio.track.bookId === bookId &&
    audio.track.chapter === chapter &&
    audio.track.locale === primaryLocale;
  const chapterRepeating = chapterLoaded && audio.repeat === "verse";
  // While following, audio publishes the next verse before the selection effect.
  // A manual selection opts out of following and becomes the toolbar target.
  const actionVerse =
    followingNarration && chapterLoaded && audio.track?.verse !== undefined
      ? audio.track.verse
      : Math.max(1, selectedVerse);
  const saved = bookmarks.includes(`${chapterKey}:${actionVerse}`);
  const actionLoaded =
    actionVerse !== undefined &&
    matchesVerseAudio(audio.track, {
      bookId,
      chapter,
      verse: actionVerse,
      locale: primaryLocale,
    });
  // Keep the existing loop escapable when the selected verse has no aligned
  // audio. Valid verse selections can still directly become the new loop.
  const exitUnavailableRepeat =
    audio.repeat === "verse" &&
    !actionLoaded &&
    !tracks.some(
      (track) =>
        track.verse === actionVerse ||
        track.coveredVerses?.includes(actionVerse),
    );
  const repeating = (actionLoaded && chapterRepeating) || exitUnavailableRepeat;
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
    pickerView !== null || dialogOpen || selection !== null;
  useChapterKeyboard(!mobile && !interactionBlocked, changeChapter);
  useReaderBackGuard(!interactionBlocked);
  const missingNarration = useCallback(
    (number: number): boolean => {
      if (
        !isVerseMissing(
          getChapterRecording(bookId, chapter, primaryLocale),
          number,
        )
      )
        return false;
      notify(
        bi(
          "原录音未朗读本节",
          "This verse is not narrated in the source recording.",
        ),
      );
      return true;
    },
    [bookId, chapter, primaryLocale, notify, bi],
  );
  const playVerse = useCallback(
    (number: number, loop = false): boolean => {
      if (missingNarration(number)) return false;
      if (!available) {
        notify(
          bi(
            "无法读取本章音频，请检查资源服务地址与连接。",
            "Chapter audio is unavailable. Check the resource server connection.",
          ),
        );
        return false;
      }
      if (chapterOnlyAudio) {
        notify(
          bi(
            "此章时间轴不可用，可播放整章，暂不支持逐句循环。",
            "Verse timing is unavailable. You can listen to the full chapter.",
          ),
        );
        return false;
      }
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
        return false;
      }
      useAppStore.getState().setSelectedVerse(number);
      setRepeat(loop ? "verse" : "off");
      useAppStore.getState().setFollowingNarration(true);
      playQueue(tracks, index);
      return true;
    },
    [
      tracks,
      available,
      chapterOnlyAudio,
      missingNarration,
      notify,
      bi,
      setRepeat,
      playQueue,
    ],
  );
  const toggleNarration = useCallback(() => {
    useAppStore.getState().setFollowingNarration(true);
    toggle();
  }, [toggle]);
  const selectionState = useRef({ interactionBlocked, mobile, actionVerse });
  useLayoutEffect(() => {
    selectionState.current = { interactionBlocked, mobile, actionVerse };
  }, [interactionBlocked, mobile, actionVerse]);
  const selectVerse = useCallback(
    (number: number) => {
      const { interactionBlocked, mobile, actionVerse } =
        selectionState.current;
      if (interactionBlocked) return;
      const { readerChromeHidden } = useAppStore.getState();
      const hidden = mobile && !readerChromeHidden && actionVerse === number;
      if (mobile && hidden !== readerChromeHidden)
        setReaderChromeHidden(hidden);
      useAppStore.getState().setFollowingNarration(false);
      useAppStore.getState().setSelectedVerse(number);
    },
    [setReaderChromeHidden],
  );
  function toggleSelectedNarration() {
    if (actionLoaded || (chapterOnlyAudio && chapterLoaded)) {
      toggleNarration();
      return;
    }
    if (chapterOnlyAudio) {
      if (missingNarration(actionVerse)) return;
      setRepeat("off");
      useAppStore.getState().setFollowingNarration(true);
      playQueue(tracks, 0);
      return;
    }
    playVerse(actionVerse);
  }
  function toggleSelectedRepeat() {
    if (exitUnavailableRepeat) {
      setRepeat("off");
    } else if (actionLoaded) {
      setRepeat(chapterRepeating ? "off" : "verse");
    } else {
      playVerse(actionVerse, true);
    }
  }
  const targetLoaded = actionLoaded || (chapterOnlyAudio && chapterLoaded);
  const playing = targetLoaded && audio.playing;
  const playLabel = chapterOnlyAudio
    ? playing
      ? bi("暂停朗读", "Pause narration")
      : targetLoaded
        ? bi("继续朗读", "Resume narration")
        : bi("朗读本章", "Read chapter aloud")
    : playing
      ? bi(`暂停第 ${actionVerse} 节`, `Pause verse ${actionVerse}`)
      : targetLoaded
        ? bi(`继续朗读第 ${actionVerse} 节`, `Resume verse ${actionVerse}`)
        : bi(`朗读第 ${actionVerse} 节`, `Read from verse ${actionVerse}`);
  const contentButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bi("切换内容显示", "Switch content display")}
      accessibilityValue={{ text: contentLabel }}
      accessibilityHint={bi(
        "点击依次切换：中、英、中英、英中",
        "Tap to cycle: Chinese, English, Chinese–English, English–Chinese",
      )}
      onPress={cycleContent}
      style={({ pressed }) => ({
        width: 44,
        minHeight: 44,
        flexShrink: 0,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 10,
        backgroundColor: pressed ? c.sidebar : "transparent",
      })}
    >
      <Txt style={{ fontFamily: fonts.medium, fontSize: 13, color: c.green }}>
        {contentLabel}
      </Txt>
    </Pressable>
  );
  const selectPage = useCallback(
    (page: ChapterPage) => {
      openReadingPosition(
        { ...page, verse: 1, offset: 0 },
        { selectVerse: false },
      );
    },
    [openReadingPosition],
  );
  const renderPage = useCallback(
    (page: ChapterPage, current: boolean) => (
      <ReaderPage
        key={`${page.bookId}:${page.chapter}`}
        {...page}
        current={current}
        ref={current ? currentPage : undefined}
        onWord={setSelection}
        onSelectVerse={selectVerse}
      />
    ),
    [selectVerse],
  );
  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      {(!mobile || !readerChromeHidden) && (
        <View
          accessibilityLabel={bi("阅读工具栏", "Reading toolbar")}
          style={{
            position: mobile ? "absolute" : "relative",
            top: 0,
            zIndex: 10,
            height: mobile ? readerToolbarHeight : undefined,
            paddingHorizontal: mobile ? (width < 360 ? 4 : 8) : 0,
            maxWidth: 760,
            width: "100%",
            alignSelf: "center",
            backgroundColor: c.bg,
            paddingVertical: 6,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: mobile ? 2 : 8,
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
              gap: mobile ? 4 : 0,
            }}
          >
            {mobile && <ReaderBrand showName={width >= 600} />}
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
                  paddingHorizontal: mobile ? (width < 360 ? 4 : 8) : 4,
                  minHeight: 44,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {!mobile && <BookOpen size={18} color={c.green} />}
                <Txt
                  numberOfLines={1}
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 13,
                    flexShrink: 1,
                  }}
                >
                  {bi(book.zh, book.en)}
                </Txt>
                {!mobile && <ChevronDown size={13} color={c.muted} />}
              </Pressable>
              <View
                style={{ width: 1, height: 16, backgroundColor: c.border }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bi("选择章节", "Choose a chapter")}
                onPress={() => setPickerView("chapters")}
                style={{
                  minWidth: mobile ? 32 : 40,
                  minHeight: 44,
                  paddingHorizontal: 8,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Txt
                  style={{
                    fontFamily: fonts.bold,
                    fontSize: 13,
                  }}
                >
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
              icon={Search}
              onPress={() => {
                flush();
                openSearch();
              }}
              label={bi("搜索经文", "Search Scripture")}
              size={18}
            />
            {contentButton}
            <IconButton
              icon={playing ? Pause : Headphones}
              active={playing}
              onPress={toggleSelectedNarration}
              label={playLabel}
              size={18}
            />
            <IconButton
              icon={Repeat1}
              active={repeating}
              onPress={toggleSelectedRepeat}
              label={
                repeating
                  ? bi("退出单节重复", "Exit verse repeat")
                  : bi(
                      `循环第 ${actionVerse} 节`,
                      `Repeat verse ${actionVerse}`,
                    )
              }
              size={18}
            />
            <IconButton
              icon={Bookmark}
              active={saved}
              fillActive
              onPress={() =>
                useAppStore
                  .getState()
                  .toggleBookmark(`${chapterKey}:${actionVerse}`)
              }
              label={
                saved
                  ? bi(
                      `取消收藏第 ${actionVerse} 节`,
                      `Unsave verse ${actionVerse}`,
                    )
                  : bi(`收藏第 ${actionVerse} 节`, `Save verse ${actionVerse}`)
              }
              size={18}
            />
            {!mobile && (
              <IconButton
                icon={Bookmark}
                onPress={() => {
                  flush();
                  openBookmarks();
                }}
                label={bi("珍藏的经文", "Saved verses")}
                size={18}
              />
            )}
          </View>
        </View>
      )}
      <ChapterPager
        ref={pagerRef}
        pages={pages}
        index={pageIndex}
        enabled={!interactionBlocked}
        onBeforeChange={flush}
        onSelect={selectPage}
        renderPage={renderPage}
      />
      <ChapterPicker
        visible={pickerView !== null}
        initialView={pickerView ?? "chapters"}
        onBeforeNavigate={flush}
        onClose={() => setPickerView(null)}
      />
      <WordDialog selection={selection} onClose={() => setSelection(null)} />
    </View>
  );
}
