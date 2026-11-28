import React, { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ArrowRight,
  BookOpen,
  BookMarked,
  ChevronRight,
} from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { fonts, typeScale } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, Txt } from "../../shared/ui";
import { dueWords } from "../../domain/vocabulary";
import { ChapterPicker } from "../reader/ChapterPicker";
import { HomeHighlights, HomeWorship } from "./HomeHighlights";
import { FeaturedVerseCard } from "./FeaturedVerseCard";
import { HomeCard, HomeCardTitle } from "./HomeCard";
import { EnglishHomeEntry } from "../english-lessons/EnglishHomeEntry";

const readingActionStyle = {
  flexGrow: 1,
  minHeight: 48,
  maxWidth: "100%",
} as const;

export function HomeScreen() {
  const { colors: c } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const mobile = width < 760;
  const contentWidth = width - (width >= 900 ? 228 : 0);
  const columns = contentWidth >= 960 && fontScale < 1.4;
  const { bi, locale } = useI18n();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const directoryLabel = bi("圣经目录", "Bible directory");
  const {
    bookId,
    chapter,
    verse: selectedVerse,
  } = useAppStore((s) => s.readingPosition);
  const words = useAppStore((s) => s.words);
  const due = dueWords(words).length;
  const book = bibleRepository.getBook(bookId);
  const verse = bibleRepository
    .getChapter(bookId, chapter)
    .find((item) => item.number === selectedVerse);

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{
        paddingHorizontal: mobile ? 20 : 32,
        paddingTop: mobile ? 16 : 24,
        paddingBottom: 32,
      }}
    >
      <View
        style={{
          maxWidth: 1180,
          width: "100%",
          alignSelf: "center",
          gap: mobile ? 20 : 24,
        }}
      >
        <View
          style={{
            flexDirection: columns ? "row" : "column",
            alignItems: columns ? "flex-start" : "stretch",
            gap: 16,
          }}
        >
          <View style={{ flex: columns ? 1.45 : undefined, minWidth: 0 }}>
            <FeaturedVerseCard />
          </View>

          <View style={{ flex: columns ? 1 : undefined, minWidth: 0, gap: 16 }}>
            <HomeCard label={bi("继续阅读", "CONTINUE READING")}>
              <View style={{ gap: 8 }}>
                <HomeCardTitle>
                  {bi(book.zh, book.en)} {chapter}:{selectedVerse}
                </HomeCardTitle>
                {verse && (
                  <Txt
                    numberOfLines={2}
                    style={{
                      fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                      fontSize: 15,
                      lineHeight: 25,
                      color: c.textMuted,
                    }}
                  >
                    {bi(verse.zh, verse.en)}
                  </Txt>
                )}
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                <Button
                  secondary
                  icon={BookOpen}
                  label={directoryLabel}
                  style={readingActionStyle}
                  onPress={() => setDirectoryOpen(true)}
                >
                  {directoryLabel}
                </Button>
                <Button
                  icon={ArrowRight}
                  style={readingActionStyle}
                  onPress={() => {
                    useAppStore.getState().resumeReading();
                    router.push("/bible");
                  }}
                >
                  {bi("从这里继续", "Continue reading")}
                </Button>
              </View>
            </HomeCard>

            <HomeWorship />

            <EnglishHomeEntry />

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={bi("我的词汇", "My vocabulary")}
              onPress={() => router.push("/vocabulary")}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 20,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: c.border,
                backgroundColor: c.primarySoft,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: c.surface,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookMarked size={22} color={c.primary} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
                  {bi("我的词汇", "My vocabulary")}
                </Txt>
                <Txt
                  style={{
                    color: c.textMuted,
                    fontSize: typeScale.label,
                    lineHeight: 20,
                  }}
                >
                  {bi(
                    `已收藏 ${words.length} 个单词 · 待复习 ${due} 个`,
                    `${words.length} saved words · ${due} due for review`,
                  )}
                </Txt>
              </View>
              <ChevronRight size={19} color={c.primary} />
            </Pressable>
          </View>
        </View>

        <HomeHighlights />
      </View>
      <ChapterPicker
        visible={directoryOpen}
        initialView="books"
        onClose={() => setDirectoryOpen(false)}
        onNavigate={(position) => {
          useAppStore.getState().openReadingPosition(position);
          router.push("/bible");
        }}
      />
    </ScrollView>
  );
}
