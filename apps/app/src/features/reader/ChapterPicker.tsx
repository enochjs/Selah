import React, { useState } from "react";
import { View, Pressable, TextInput } from "react-native";
import { Check, Headphones, ChevronLeft } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { hasChapterAudio } from "../../data/audio-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Dialog, Pill, inputStyle } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
export function ChapterPicker({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { bi } = useI18n();
  const currentId = useAppStore((s) => s.bookId),
    currentChapter = useAppStore((s) => s.chapter);
  const [bookId, setBookId] = useState<string | null>(null),
    [query, setQuery] = useState(""),
    [testament, setTestament] = useState<"old" | "new">("old");
  const books = bibleRepository.listBooks();
  const book = bookId ? bibleRepository.getBook(bookId) : null;
  const close = () => {
    setBookId(null);
    setQuery("");
    onClose();
  };
  return (
    <Dialog
      visible={visible}
      onClose={close}
      title={book ? bi(book.zh, book.en) : bi("翻开圣经", "Open the Bible")}
      width={620}
    >
      {book ? (
        <>
          <Pressable
            accessibilityRole="button"
            onPress={() => setBookId(null)}
            style={{
              flexDirection: "row",
              gap: 6,
              marginBottom: 22,
              alignItems: "center",
            }}
          >
            <ChevronLeft size={16} color={c.green} />
            <Txt style={{ color: c.green, fontSize: 12 }}>
              {bi("选择书卷", "All books")}
            </Txt>
          </Pressable>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 9 }}>
            {book.chapters.map((_, i) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${bi(book.zh, book.en)} ${i + 1}`}
                key={i}
                onPress={() => {
                  useAppStore.getState().setChapter(book.id, i + 1);
                  close();
                }}
                style={({ hovered }) => ({
                  width: 49,
                  height: 48,
                  borderRadius: 9,
                  borderWidth: 1,
                  borderColor: c.border,
                  justifyContent: "center",
                  alignItems: "center",
                  backgroundColor:
                    currentId === book.id && currentChapter === i + 1
                      ? c.green
                      : hovered
                        ? c.lightGreen
                        : c.bg,
                })}
              >
                <Txt
                  style={{
                    color:
                      currentId === book.id && currentChapter === i + 1
                        ? "#fff"
                        : c.ink,
                  }}
                >
                  {i + 1}
                </Txt>
                {hasChapterAudio(book.id, i + 1) && (
                  <Headphones
                    size={8}
                    color={
                      currentId === book.id && currentChapter === i + 1
                        ? "#fff"
                        : c.green
                    }
                    style={{ position: "absolute", bottom: 4 }}
                  />
                )}
              </Pressable>
            ))}
          </View>
        </>
      ) : (
        <>
          <TextInput
            accessibilityLabel={bi("搜索书卷", "Search books")}
            value={query}
            onChangeText={setQuery}
            placeholder={bi("搜索书卷名称…", "Search for a book…")}
            placeholderTextColor={c.muted}
            style={inputStyle}
          />
          <View style={{ flexDirection: "row", marginVertical: 17, gap: 8 }}>
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
          {books
            .filter((b) =>
              query
                ? b.en.toLowerCase().includes(query.toLowerCase()) ||
                  b.zh.includes(query)
                : b.testament === testament,
            )
            .map((b) => (
              <Pressable
                accessibilityRole="button"
                key={b.id}
                onPress={() => setBookId(b.id)}
                style={({ hovered }) => ({
                  flexDirection: "row",
                  alignItems: "center",
                  borderRadius: 8,
                  padding: 14,
                  gap: 8,
                  backgroundColor: hovered ? c.lightGreen : "#fff",
                })}
              >
                <View style={{ flex: 1, gap: 5 }}>
                  <Txt style={{ fontFamily: fonts.medium }}>
                    {bi(b.zh, b.en)}
                  </Txt>
                  <Txt style={{ color: c.muted, fontSize: 10 }}>
                    {bi(b.en, b.zh)} · {b.chapters.length}{" "}
                    {bi("章", "chapters")}
                  </Txt>
                </View>
                {b.id === currentId && <Check size={17} color={c.green} />}
              </Pressable>
            ))}
        </>
      )}
    </Dialog>
  );
}
