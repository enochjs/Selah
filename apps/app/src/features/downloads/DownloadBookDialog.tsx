import React, { useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import type { Book } from "../../domain/models";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Button, Dialog, IconButton, Txt, inputStyle } from "../../shared/ui";

interface DownloadBookDialogProps {
  visible: boolean;
  books: Book[];
  selectedBookId: string | null;
  preparing: boolean;
  error: string | null;
  onBook: (book: Book) => Promise<void>;
  onRetry: () => Promise<void>;
  onClose: () => void;
  onDismiss: () => void;
}

export function DownloadBookDialog({
  visible,
  books,
  selectedBookId,
  preparing,
  error,
  onBook,
  onRetry,
  onClose,
  onDismiss,
}: DownloadBookDialogProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const mobile = width < 900;
  const columns = width >= 480 ? 4 : 3;
  const [testament, setTestament] = useState<"old" | "new">("old");
  const [query, setQuery] = useState("");
  const selected = books.find((book) => book.id === selectedBookId);
  const name = (book: Book) => bi(book.zh, book.en);
  const matches = books.filter(
    (book) =>
      book.testament === testament &&
      (mobile ||
        `${book.zh} ${book.en}`
          .toLowerCase()
          .includes(query.trim().toLowerCase())),
  );
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={bi("选择书卷", "Choose a book")}
      width={620}
      presentation={mobile ? "bottom" : "center"}
      heightMode="large"
      scrollable={false}
      dismissible={!preparing}
      header={({ onClose: close, dismissible }) => (
        <View
          style={{
            flexShrink: 0,
            paddingHorizontal: 20,
            paddingTop: 8,
            borderBottomWidth: 1,
            borderColor: c.border,
            gap: 8,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt
              accessibilityRole="header"
              style={{ flex: 1, fontFamily: fonts.bold, fontSize: 18 }}
            >
              {bi("选择书卷", "Choose a book")}
            </Txt>
            <IconButton
              icon={X}
              label={bi("关闭", "Close")}
              onPress={close}
              disabled={!dismissible}
            />
          </View>
          {!mobile && (
            <TextInput
              accessibilityLabel={bi("搜索书卷", "Search books")}
              value={query}
              onChangeText={setQuery}
              editable={!preparing}
              placeholder={bi("搜索书卷名称…", "Search for a book…")}
              style={inputStyle}
            />
          )}
          <View
            accessibilityRole="tablist"
            accessibilityLabel={bi("经文分组", "Testament")}
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 8,
              paddingBottom: 8,
            }}
          >
            {(["old", "new"] as const).map((group) => (
              <Pressable
                key={group}
                accessibilityRole="tab"
                accessibilityState={{
                  selected: testament === group,
                  disabled: preparing,
                }}
                disabled={preparing}
                onPress={() => setTestament(group)}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  paddingHorizontal: 13,
                  paddingVertical: 8,
                  justifyContent: "center",
                  borderRadius: 8,
                  backgroundColor:
                    testament === group ? c.green : "transparent",
                  opacity: preparing ? 0.5 : 1,
                }}
              >
                <Txt
                  style={{
                    fontSize: typeScale.label,
                    fontFamily: fonts.medium,
                    color: testament === group ? c.paper : c.muted,
                  }}
                >
                  {group === "old"
                    ? bi("旧约", "Old Testament")
                    : bi("新约", "New Testament")}
                </Txt>
              </Pressable>
            ))}
          </View>
          {(preparing || error) && (
            <View style={{ gap: 8, paddingBottom: 12 }}>
              {preparing ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <ActivityIndicator color={c.green} />
                  <Txt
                    accessibilityLiveRegion="polite"
                    style={{
                      flex: 1,
                      fontSize: typeScale.label,
                      lineHeight: 20,
                    }}
                  >
                    {bi(
                      `正在准备《${selected ? name(selected) : ""}》下载信息`,
                      `Preparing download information for ${selected ? name(selected) : "this book"}…`,
                    )}
                  </Txt>
                </View>
              ) : (
                <>
                  <Txt
                    accessibilityLiveRegion="polite"
                    style={{
                      color: c.red,
                      lineHeight: 21,
                      fontSize: typeScale.label,
                    }}
                  >
                    {error}
                  </Txt>
                  <Button secondary small onPress={onRetry}>
                    {bi("重试", "Retry")}
                  </Button>
                </>
              )}
            </View>
          )}
        </View>
      )}
    >
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 16 }}
      >
        <View
          style={
            mobile
              ? { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 }
              : { gap: 8 }
          }
        >
          {matches.map((book) => (
            <View
              key={book.id}
              style={
                mobile ? { width: `${100 / columns}%`, padding: 4 } : undefined
              }
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={name(book)}
                accessibilityState={{
                  selected: book.id === selectedBookId,
                  disabled: preparing,
                }}
                disabled={preparing}
                onPress={() => onBook(book)}
                style={{
                  minHeight: 56,
                  minWidth: 44,
                  paddingHorizontal: 8,
                  paddingVertical: 12,
                  justifyContent: "center",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: book.id === selectedBookId ? c.green : c.border,
                  backgroundColor:
                    book.id === selectedBookId ? c.lightGreen : c.paper,
                  opacity: preparing && book.id !== selectedBookId ? 0.5 : 1,
                }}
              >
                <Txt
                  style={{
                    fontSize: typeScale.label,
                    lineHeight: 20,
                    textAlign: mobile ? "center" : "left",
                    fontFamily: fonts.medium,
                  }}
                >
                  {name(book)}
                </Txt>
                {!mobile && (
                  <Txt
                    style={{
                      color: c.muted,
                      fontSize: typeScale.caption,
                      marginTop: 4,
                    }}
                  >
                    {book.chapters.length} {bi("章", "chapters")}
                  </Txt>
                )}
              </Pressable>
            </View>
          ))}
          {!matches.length && (
            <Txt style={{ color: c.muted }}>
              {bi("没有匹配的书卷。", "No matching books.")}
            </Txt>
          )}
        </View>
      </ScrollView>
    </Dialog>
  );
}
