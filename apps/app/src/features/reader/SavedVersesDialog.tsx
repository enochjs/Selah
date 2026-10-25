import React, { useEffect, useRef } from "react";
import { ScrollView, Pressable, useWindowDimensions } from "react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Button, Dialog, Txt } from "../../shared/ui";

interface SavedVersesDialogProps {
  visible: boolean;
  onClose: () => void;
  onOpenVerse: (bookId: string, chapter: number, verse: number) => void;
  onOpenReader: () => void;
}

export function SavedVersesDialog({
  visible,
  onClose,
  onOpenVerse,
  onOpenReader,
}: SavedVersesDialogProps) {
  const { bi, locale } = useI18n();
  const mobile = useWindowDimensions().width < 900;
  const bookmarks = useAppStore((s) => s.bookmarks);
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) pending.current = null;
  }, [visible]);
  const closeThen = (action: () => void) => {
    pending.current = action;
    onClose();
  };
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={`${bi("珍藏的经文", "Saved verses")} · ${bookmarks.length}`}
      width={650}
      presentation={mobile ? "bottom" : "center"}
      heightMode={bookmarks.length ? "large" : "content"}
      scrollable={false}
      bodyStyle={!bookmarks.length ? { padding: 20, gap: 20 } : undefined}
      onDismiss={() => {
        const action = pending.current;
        pending.current = null;
        action?.();
      }}
    >
      {!bookmarks.length ? (
        <>
          <Txt style={{ color: c.muted, lineHeight: 24 }}>
            {bi(
              "在阅读时，点击经句旁的书签，收藏触动你的话语。",
              "Tap the bookmark beside a verse to keep it close.",
            )}
          </Txt>
          <Button onPress={() => closeThen(onOpenReader)}>
            {bi("去读经", "Read Scripture")}
          </Button>
        </>
      ) : (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        >
          {bookmarks.map((key) => {
            const [bookId, chapterText, verseText] = key.split(":");
            const chapter = Number(chapterText),
              number = Number(verseText);
            const book = bibleRepository.getBook(bookId);
            const verse = bibleRepository
              .getChapter(bookId, chapter)
              .find((item) => item.number === number);
            const reference = `${bi(book.zh, book.en)} ${chapter}:${number}`;
            return (
              <Pressable
                key={key}
                accessibilityRole="button"
                accessibilityLabel={bi(
                  `阅读 ${reference}`,
                  `Read ${reference}`,
                )}
                onPress={() =>
                  closeThen(() => onOpenVerse(bookId, chapter, number))
                }
                style={({ hovered }) => ({
                  paddingVertical: 16,
                  gap: 8,
                  borderBottomWidth: 1,
                  borderColor: c.border,
                  backgroundColor: hovered ? c.lightGreen : "transparent",
                })}
              >
                <Txt
                  style={{
                    color: c.green,
                    fontSize: typeScale.label,
                    fontFamily: fonts.bold,
                  }}
                >
                  {reference}
                </Txt>
                <Txt
                  numberOfLines={3}
                  style={{
                    lineHeight: 24,
                    fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                  }}
                >
                  {verse?.[locale]}
                </Txt>
              </Pressable>
            );
          })}
        </ScrollView>
      )}
    </Dialog>
  );
}
