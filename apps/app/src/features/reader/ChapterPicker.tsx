import React, { useRef, useState } from "react";
import {
  View,
  Pressable,
  TextInput,
  ScrollView,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Check, Headphones, ChevronLeft } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { hasChapterAudio } from "../../data/audio-repository";
import { useAppStore } from "../../state/app-store";
import type { ReadingPosition } from "../../domain/reading";
import { useI18n } from "../../shared/i18n";
import { Txt, Dialog, Pill, inputStyle } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";

interface ChapterPickerProps {
  visible: boolean;
  onClose: () => void;
  onBeforeNavigate?: () => void;
}

export function ChapterPicker(props: ChapterPickerProps) {
  return props.visible ? <ChapterPickerContent {...props} /> : null;
}

function ChapterPickerContent({
  onClose,
  onBeforeNavigate,
}: ChapterPickerProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const currentId = useAppStore((s) => s.bookId);
  const currentChapter = useAppStore((s) => s.chapter);
  const recent = useAppStore((s) => s.recentReadings);
  const [bookId, setBookId] = useState<string | null>(currentId);
  const [query, setQuery] = useState("");
  const [testament, setTestament] = useState(
    bibleRepository.getBook(currentId).testament,
  );
  const book = bookId ? bibleRepository.getBook(bookId) : null;
  const recentOthers = recent.filter(
    (position) =>
      position.bookId !== currentId || position.chapter !== currentChapter,
  );
  function navigate(position: ReadingPosition) {
    onBeforeNavigate?.();
    useAppStore.getState().openReadingPosition(position);
    onClose();
  }
  return (
    <Dialog
      visible
      onClose={onClose}
      title={book ? bi(book.zh, book.en) : bi("选择书卷", "Choose a book")}
      width={620}
      presentation={mobile ? "bottom" : "center"}
      scrollable={false}
    >
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, minHeight: 0 }}>
        {!!recentOthers.length && (
          <View
            style={{
              paddingTop: 14,
              paddingBottom: 10,
              borderBottomWidth: 1,
              borderColor: c.border,
            }}
          >
            <Txt
              style={{
                color: c.muted,
                fontSize: 11,
                marginHorizontal: 20,
                marginBottom: 8,
              }}
            >
              {bi("最近访问", "Recent passages")}
            </Txt>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingHorizontal: 20, gap: 8 }}
            >
              {recentOthers.map((position) => {
                const recentBook = bibleRepository.getBook(position.bookId);
                const label = `${bi(recentBook.zh, recentBook.en)} ${position.chapter}:${position.verse}`;
                return (
                  <Pressable
                    key={`${position.bookId}:${position.chapter}`}
                    accessibilityRole="button"
                    accessibilityLabel={bi(
                      `返回 ${label}`,
                      `Return to ${label}`,
                    )}
                    onPress={() => navigate(position)}
                    style={{
                      paddingHorizontal: 13,
                      paddingVertical: 11,
                      backgroundColor: c.lightGreen,
                      borderRadius: 9,
                    }}
                  >
                    <Txt style={{ fontSize: 12, color: c.green }}>{label}</Txt>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        )}
        {book ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi("选择书卷", "All books")}
            onPress={() => setBookId(null)}
            style={{
              flexDirection: "row",
              gap: 6,
              paddingHorizontal: 20,
              paddingVertical: 16,
              alignItems: "center",
            }}
          >
            <ChevronLeft size={16} color={c.green} />
            <Txt style={{ color: c.green, fontSize: 12 }}>
              {bi("选择书卷", "All books")}
            </Txt>
          </Pressable>
        ) : (
          <View style={{ paddingHorizontal: 20, paddingTop: 14 }}>
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
            <View style={{ flexDirection: "row", marginVertical: 10, gap: 8 }}>
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
      </SafeAreaView>
    </Dialog>
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
      style={{ flex: 1, minHeight: 0 }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}
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
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
          {book.chapters.map((_, index) => {
            const chapter = index + 1;
            const active = book.id === currentId && chapter === currentChapter;
            return (
              <Pressable
                key={chapter}
                accessibilityRole="button"
                accessibilityLabel={`${bi(book.zh, book.en)} ${chapter}`}
                accessibilityState={{ selected: active }}
                onPress={() => onChapter(chapter)}
                onLayout={
                  active
                    ? (event) => focus(event.nativeEvent.layout.y)
                    : undefined
                }
                style={({ hovered }) => ({
                  width: 49,
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
                <Txt style={{ color: active ? "#fff" : c.ink }}>{chapter}</Txt>
                {hasChapterAudio(book.id, chapter) && (
                  <Headphones
                    size={8}
                    color={active ? "#fff" : c.green}
                    style={{ position: "absolute", bottom: 4 }}
                  />
                )}
              </Pressable>
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
                  height: mobile ? 68 : undefined,
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
                    numberOfLines={mobile ? 2 : undefined}
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: mobile ? 13 : 14,
                      lineHeight: 20,
                      textAlign: mobile ? "center" : "left",
                      color: item.id === currentId ? c.green : c.ink,
                    }}
                  >
                    {bi(item.zh, item.en).replace(/^([1-3]) /, "$1\u00a0")}
                  </Txt>
                  {!mobile && (
                    <Txt style={{ color: c.muted, fontSize: 10 }}>
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
