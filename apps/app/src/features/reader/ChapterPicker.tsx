import React, { useRef, useState } from "react";
import {
  View,
  TextInput,
  ScrollView,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  History,
  X,
} from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import type { ReadingPosition } from "../../domain/reading";
import { useI18n } from "../../shared/i18n";
import { Txt, Dialog, Pill, IconButton, inputStyle } from "../../shared/ui";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { bookAbbreviations } from "./book-abbreviations";

interface ChapterPickerProps {
  visible: boolean;
  initialView?: "books" | "chapters";
  onClose: () => void;
  onBeforeNavigate?: () => void;
}

export function ChapterPicker(props: ChapterPickerProps) {
  return props.visible ? <ChapterPickerContent {...props} /> : null;
}

function ChapterPickerContent({
  onClose,
  onBeforeNavigate,
  initialView = "chapters",
}: ChapterPickerProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const currentId = useAppStore((s) => s.bookId);
  const currentChapter = useAppStore((s) => s.chapter);
  const recent = useAppStore((s) => s.recentReadings);
  const bookScrollPositions = useRef<Partial<Record<"old" | "new", number>>>(
    {},
  );
  const [visible, setVisible] = useState(true);
  const [bookId, setBookId] = useState<string | null>(
    initialView === "books" ? null : currentId,
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [testament, setTestament] = useState(
    bibleRepository.getBook(currentId).testament,
  );
  const book = bookId ? bibleRepository.getBook(bookId) : null;
  const large = !historyOpen && (!book || book.chapters.length >= 100);
  const title = historyOpen
    ? bi("阅读历史", "Reading history")
    : book
      ? bi(book.zh, book.en)
      : bi("选择书卷", "Choose a book");
  function close() {
    setVisible(false);
  }
  function navigate(position: ReadingPosition) {
    onBeforeNavigate?.();
    useAppStore.getState().openReadingPosition(position);
    close();
  }
  return (
    <Dialog
      visible={visible}
      onClose={close}
      onDismiss={onClose}
      title={title}
      width={620}
      presentation={mobile ? "bottom" : "center"}
      scrollable={false}
      heightMode={large ? "large" : "content"}
      header={({ onClose: closeHeader, dismissible }) => (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: mobile ? 16 : 12,
            paddingVertical: mobile ? 12 : 8,
            flexShrink: 0,
            gap: 8,
            borderBottomWidth: mobile ? 0 : 1,
            borderColor: c.border,
          }}
        >
          {(book || historyOpen) && (
            <IconButton
              icon={ChevronLeft}
              label={
                historyOpen && book
                  ? bi("返回章节", "Back to chapters")
                  : bi("选择书卷", "All books")
              }
              onPress={() =>
                historyOpen ? setHistoryOpen(false) : setBookId(null)
              }
            />
          )}
          <Txt
            accessibilityRole="header"
            style={{
              flex: 1,
              fontFamily: fonts.medium,
              fontSize: mobile ? 20 : 18,
            }}
          >
            {title}
          </Txt>
          <IconButton
            icon={History}
            label={bi("阅读历史", "Reading history")}
            active={historyOpen}
            onPress={() => setHistoryOpen(!historyOpen)}
          />
          <IconButton
            icon={X}
            label={bi("关闭", "Close")}
            onPress={closeHeader}
            disabled={!dismissible}
          />
        </View>
      )}
    >
      <View
        style={[
          { flexShrink: 1, minHeight: 0 },
          { flexGrow: large ? 1 : 0, flexBasis: large ? 0 : "auto" },
        ]}
      >
        {!historyOpen && !book && (
          <View
            style={{
              paddingHorizontal: mobile ? 0 : 20,
              paddingTop: mobile ? 0 : 8,
              flexShrink: 0,
            }}
          >
            {!mobile && (
              <TextInput
                accessibilityLabel={bi("搜索书卷", "Search books")}
                value={query}
                onChangeText={setQuery}
                placeholder={bi("搜索书卷名称…", "Search for a book…")}
                placeholderTextColor={c.muted}
                style={inputStyle}
              />
            )}
            {mobile ? (
              <View
                accessibilityRole="tablist"
                accessibilityLabel={bi("选择旧约或新约", "Choose a testament")}
                style={{
                  flexDirection: "row",
                  borderBottomWidth: 1,
                  borderColor: c.border,
                }}
              >
                {(["old", "new"] as const).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      value === "old"
                        ? bi("旧约 · 39 卷", "Old Testament · 39")
                        : bi("新约 · 27 卷", "New Testament · 27")
                    }
                    accessibilityState={{ selected: testament === value }}
                    onPress={() => setTestament(value)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minHeight: 52,
                      flexDirection: "row",
                      justifyContent: "center",
                      alignItems: "center",
                      gap: 8,
                      borderBottomWidth: 2,
                      borderBottomColor:
                        testament === value ? c.green : "transparent",
                      backgroundColor: pressed ? c.lightGreen : c.paper,
                    })}
                  >
                    <Txt
                      style={{
                        fontSize: 15,
                        fontFamily:
                          testament === value ? fonts.medium : fonts.regular,
                        color: testament === value ? c.green : c.muted,
                      }}
                    >
                      {value === "old"
                        ? bi("旧约", "Old Testament")
                        : bi("新约", "New Testament")}
                    </Txt>
                    <Txt
                      style={{ fontSize: typeScale.caption, color: c.muted }}
                    >
                      {value === "old" ? "39" : "27"}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  marginVertical: 6,
                  gap: 6,
                }}
              >
                <Pill
                  active={testament === "old"}
                  onPress={() => setTestament("old")}
                >
                  {bi("旧约 · 39 卷", "Old Testament · 39")}
                </Pill>
                <Pill
                  active={testament === "new"}
                  onPress={() => setTestament("new")}
                >
                  {bi("新约 · 27 卷", "New Testament · 27")}
                </Pill>
              </View>
            )}
          </View>
        )}
        {historyOpen ? (
          <ReadingHistory recent={recent} onNavigate={navigate} />
        ) : (
          <PickerList
            key={`${bookId ?? "books"}:${testament}:${mobile ? "" : query}`}
            bookId={bookId}
            currentId={currentId}
            currentChapter={currentChapter}
            query={mobile ? "" : query}
            testament={testament}
            getInitialScrollY={() =>
              !book && !query.trim()
                ? (bookScrollPositions.current[testament] ??
                  (testament === bibleRepository.getBook(currentId).testament
                    ? undefined
                    : 0))
                : undefined
            }
            onScrollPosition={(y) => {
              if (!book && !query.trim())
                bookScrollPositions.current[testament] = y;
            }}
            onBook={(id) => {
              setBookId(id);
              setQuery("");
            }}
            onChapter={(chapter) => {
              if (book)
                navigate({ bookId: book.id, chapter, verse: 1, offset: 0 });
            }}
          />
        )}
      </View>
    </Dialog>
  );
}

function ReadingHistory({
  recent,
  onNavigate,
}: {
  recent: ReadingPosition[];
  onNavigate: (position: ReadingPosition) => void;
}) {
  const { bi } = useI18n();
  return (
    <ScrollView
      style={{ flexShrink: 1, minHeight: 0 }}
      contentContainerStyle={{ padding: 20, gap: 8 }}
    >
      {recent.length ? (
        recent.slice(0, 6).map((position) => {
          const book = bibleRepository.getBook(position.bookId);
          const label = `${bi(book.zh, book.en)} ${position.chapter}:${position.verse}`;
          return (
            <Pressable
              key={`${position.bookId}:${position.chapter}`}
              accessibilityRole="button"
              accessibilityLabel={bi(`返回 ${label}`, `Return to ${label}`)}
              onPress={() => onNavigate(position)}
              style={({ hovered, pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                minHeight: 56,
                padding: 14,
                gap: 12,
                borderWidth: 1,
                borderColor: c.border,
                borderRadius: 10,
                backgroundColor: hovered || pressed ? c.lightGreen : c.bg,
              })}
            >
              <Txt style={{ flex: 1, fontFamily: fonts.medium }}>{label}</Txt>
              <ChevronRight size={18} color={c.muted} />
            </Pressable>
          );
        })
      ) : (
        <View style={{ alignItems: "center", paddingVertical: 32, gap: 12 }}>
          <History size={28} color={c.muted} />
          <Txt style={{ fontFamily: fonts.medium }}>
            {bi("还没有阅读历史", "No reading history yet")}
          </Txt>
          <Txt style={{ color: c.muted, textAlign: "center" }}>
            {bi(
              "浏览经文后，最近阅读的位置会显示在这里。",
              "Your recent reading positions will appear here as you read.",
            )}
          </Txt>
        </View>
      )}
    </ScrollView>
  );
}

interface PickerListProps {
  bookId: string | null;
  currentId: string;
  currentChapter: number;
  query: string;
  testament: "old" | "new";
  getInitialScrollY?: () => number | undefined;
  onScrollPosition?: (y: number) => void;
  onBook: (id: string) => void;
  onChapter: (chapter: number) => void;
}

function PickerList({
  bookId,
  currentId,
  currentChapter,
  query,
  testament,
  getInitialScrollY,
  onScrollPosition,
  onBook,
  onChapter,
}: PickerListProps) {
  const { bi, locale } = useI18n();
  const { width, fontScale = 1 } = useWindowDimensions();
  const mobile = width < 900;
  const preferredColumns =
    width >= 700
      ? 8
      : width >= 600
        ? 6
        : width >= 480 || (width >= 360 && locale !== "en")
          ? 4
          : 3;
  const columns = Math.min(
    preferredColumns,
    fontScale >= 1.6 ? 2 : fontScale >= 1.3 ? 3 : 8,
  );
  const panelWidth = mobile ? width : Math.min(620, width * 0.94);
  const chapterColumns = Math.max(1, Math.floor((panelWidth - 40 + 8) / 57));
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const focusY = useRef<number | null>(null);
  const viewportHeight = useRef(0);
  const contentHeight = useRef(0);
  const positioned = useRef(false);
  const book = bookId ? bibleRepository.getBook(bookId) : null;
  const books = bibleRepository
    .listBooks()
    .filter((item) =>
      query.trim()
        ? item.en.toLowerCase().includes(query.trim().toLowerCase()) ||
          item.zh.includes(query.trim())
        : item.testament === testament,
    );
  function positionCurrent() {
    if (positioned.current || !viewportHeight.current || !contentHeight.current)
      return;
    const initialScrollY = getInitialScrollY?.();
    if (initialScrollY === undefined && focusY.current === null) return;
    const y = Math.max(
      0,
      Math.min(
        initialScrollY ?? (focusY.current ?? 0) - viewportHeight.current / 3,
        contentHeight.current - viewportHeight.current,
      ),
    );
    scrollRef.current?.scrollTo({ y, animated: false });
    positioned.current = true;
    onScrollPosition?.(y);
  }
  function focus(y: number) {
    focusY.current = y;
    positionCurrent();
  }
  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={(event) => {
        if (positioned.current)
          onScrollPosition?.(event.nativeEvent.contentOffset.y);
      }}
      style={{ flexShrink: 1, minHeight: 0 }}
      contentContainerStyle={{
        paddingHorizontal: mobile && !book ? 0 : 20,
        paddingTop: mobile && !book ? 0 : 12,
        paddingBottom: 20,
      }}
      onLayout={(event) => {
        viewportHeight.current = event.nativeEvent.layout.height;
        positionCurrent();
      }}
      onContentSizeChange={(_width, height) => {
        contentHeight.current = height;
        positionCurrent();
      }}
    >
      {book ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            marginHorizontal: -4,
            rowGap: 8,
          }}
        >
          {book.chapters.map((_, index) => {
            const chapter = index + 1;
            const active = book.id === currentId && chapter === currentChapter;
            return (
              <View
                key={chapter}
                style={{
                  width: `${100 / chapterColumns}%`,
                  paddingHorizontal: 4,
                }}
                onLayout={
                  active
                    ? (event) => focus(event.nativeEvent.layout.y)
                    : undefined
                }
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${bi(book.zh, book.en)} ${chapter}`}
                  accessibilityState={{ selected: active }}
                  onPress={() => onChapter(chapter)}
                  style={({ hovered, pressed }) => ({
                    aspectRatio: 1,
                    minHeight: 48,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: c.border,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: active
                      ? c.green
                      : hovered || pressed
                        ? c.lightGreen
                        : c.bg,
                  })}
                >
                  <Txt style={{ color: active ? c.paper : c.ink }}>
                    {chapter}
                  </Txt>
                </Pressable>
              </View>
            );
          })}
        </View>
      ) : books.length ? (
        <View
          style={
            mobile ? { flexDirection: "row", flexWrap: "wrap" } : undefined
          }
        >
          {books.map((item, index) => (
            <View
              key={item.id}
              onLayout={
                item.id === currentId && !query
                  ? (event) => focus(event.nativeEvent.layout.y)
                  : undefined
              }
              style={mobile ? { width: `${100 / columns}%` } : undefined}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  mobile
                    ? bi(item.zh, item.en)
                    : `${bi(item.zh, item.en)} · ${item.chapters.length} ${bi("章", "chapters")}`
                }
                accessibilityState={{ selected: item.id === currentId }}
                onPress={() => onBook(item.id)}
                style={({ hovered, pressed }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: mobile ? 0 : 8,
                  padding: mobile ? 12 : 14,
                  gap: mobile ? 0 : 8,
                  width: mobile ? "100%" : undefined,
                  minHeight: mobile
                    ? Math.max(panelWidth / columns, 96 * fontScale)
                    : undefined,
                  borderBottomWidth: mobile ? 1 : 0,
                  borderColor: c.border,
                  backgroundColor:
                    item.id === currentId
                      ? c.lightGreen
                      : hovered || pressed
                        ? c.sidebar
                        : mobile
                          ? c.paper
                          : "transparent",
                })}
              >
                <View style={{ flex: 1, gap: mobile ? 4 : 5 }}>
                  {mobile && (
                    <Txt
                      style={{
                        fontFamily:
                          locale === "en" ? fonts.regular : fonts.scriptureZh,
                        fontSize: locale === "en" ? 19 : 24,
                        lineHeight: 32,
                        textAlign: "left",
                        color: item.id === currentId ? c.green : c.ink,
                      }}
                    >
                      {bi(
                        ...(bookAbbreviations[item.id] ?? [item.zh, item.en]),
                      )}
                    </Txt>
                  )}
                  <Txt
                    style={{
                      fontFamily: mobile ? fonts.regular : fonts.medium,
                      fontSize: mobile ? typeScale.label : typeScale.body,
                      lineHeight: mobile ? 18 : 20,
                      textAlign: "left",
                      color:
                        item.id === currentId
                          ? c.green
                          : mobile
                            ? c.muted
                            : c.ink,
                    }}
                  >
                    {bi(item.zh, item.en).replace(/^([1-3]) /, "$1\u00a0")}
                  </Txt>
                  {!mobile && (
                    <Txt
                      style={{ color: c.muted, fontSize: typeScale.caption }}
                    >
                      {bi(item.en, item.zh)} · {item.chapters.length}{" "}
                      {bi("章", "chapters")}
                    </Txt>
                  )}
                </View>
                {!mobile && item.id === currentId && (
                  <Check size={17} color={c.green} />
                )}
              </Pressable>
              {mobile && item.id === currentId && (
                <View
                  pointerEvents="none"
                  accessible={false}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: 2,
                    backgroundColor: c.green,
                  }}
                />
              )}
              {mobile && (index + 1) % columns !== 0 && (
                <View
                  testID="book-grid-divider"
                  pointerEvents="none"
                  accessible={false}
                  style={{
                    position: "absolute",
                    top: 0,
                    bottom: 0,
                    right: 0,
                    width: 1,
                    backgroundColor: c.border,
                  }}
                />
              )}
            </View>
          ))}
        </View>
      ) : (
        <Txt style={{ color: c.muted, padding: 14 }}>
          {bi("没有找到书卷", "No books found")}
        </Txt>
      )}
    </ScrollView>
  );
}
