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
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexShrink: 0,
            gap: 8,
            borderBottomWidth: 1,
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
              fontFamily: fonts.bold,
              fontSize: 18,
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
          <View style={{ paddingHorizontal: 20, paddingTop: 8, flexShrink: 0 }}>
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
  onBook: (id: string) => void;
  onChapter: (chapter: number) => void;
}

function PickerList({
  bookId,
  currentId,
  currentChapter,
  query,
  testament,
  onBook,
  onChapter,
}: PickerListProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const columns = width >= 480 ? 4 : 3;
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
    if (
      positioned.current ||
      focusY.current === null ||
      !viewportHeight.current ||
      !contentHeight.current
    )
      return;
    scrollRef.current?.scrollTo({
      y: Math.max(
        0,
        Math.min(
          focusY.current - viewportHeight.current / 3,
          contentHeight.current - viewportHeight.current,
        ),
      ),
      animated: false,
    });
    positioned.current = true;
  }
  function focus(y: number) {
    focusY.current = y;
    positionCurrent();
  }
  return (
    <ScrollView
      ref={scrollRef}
      keyboardShouldPersistTaps="handled"
      style={{ flexShrink: 1, minHeight: 0 }}
      contentContainerStyle={{
        paddingHorizontal: 20,
        paddingTop: 12,
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
                  style={({ hovered }) => ({
                    height: 48,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: c.border,
                    justifyContent: "center",
                    alignItems: "center",
                    backgroundColor: active
                      ? c.green
                      : hovered
                        ? c.lightGreen
                        : c.bg,
                  })}
                >
                  <Txt style={{ color: active ? "#fff" : c.ink }}>
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
            mobile
              ? { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }
              : undefined
          }
        >
          {books.map((item) => (
            <View
              key={item.id}
              onLayout={
                item.id === currentId && !query
                  ? (event) => focus(event.nativeEvent.layout.y)
                  : undefined
              }
              style={
                mobile ? { width: `${100 / columns}%`, padding: 4 } : undefined
              }
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
                style={({ hovered }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 8,
                  padding: mobile ? 6 : 14,
                  gap: mobile ? 0 : 8,
                  minHeight: mobile ? 56 : undefined,
                  borderWidth: mobile ? 1 : 0,
                  borderColor: item.id === currentId ? c.green : c.border,
                  backgroundColor:
                    item.id === currentId
                      ? c.lightGreen
                      : hovered
                        ? c.sidebar
                        : mobile
                          ? c.bg
                          : "transparent",
                })}
              >
                <View style={{ flex: 1, gap: 5 }}>
                  <Txt
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: typeScale.body,
                      lineHeight: 20,
                      textAlign: mobile ? "center" : "left",
                      color: item.id === currentId ? c.green : c.ink,
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
