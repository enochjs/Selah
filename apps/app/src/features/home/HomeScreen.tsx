import React from "react";
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
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Button, Eyebrow, Panel, Txt } from "../../shared/ui";
import { dueWords } from "../../domain/vocabulary";
import { HomeHighlights } from "./HomeHighlights";
import { FeaturedVerseCard } from "./FeaturedVerseCard";

export function HomeScreen() {
  const { width, fontScale } = useWindowDimensions();
  const mobile = width < 760;
  const contentWidth = width - (width >= 900 ? 228 : 0);
  const columns = contentWidth >= 960 && fontScale < 1.4;
  const { bi, locale } = useI18n();
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
        paddingTop: mobile ? 24 : 32,
        paddingBottom: 32,
      }}
    >
      <View
        style={{ maxWidth: 1180, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <View style={{ gap: 8 }}>
          <Eyebrow color={c.green}>
            {bi("你的安静时光", "YOUR QUIET MOMENT")}
          </Eyebrow>
          <Txt
            accessibilityRole="header"
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.scriptureZh,
              fontSize: mobile ? 26 : 32,
              lineHeight: mobile ? 38 : 44,
            }}
          >
            {bi("在话语中，安静片刻。", "A little stillness, every day.")}
          </Txt>
        </View>

        <View
          style={{
            flexDirection: columns ? "row" : "column",
            alignItems: "stretch",
            gap: 16,
          }}
        >
          <View style={{ flex: columns ? 1.45 : undefined, minWidth: 0 }}>
            <FeaturedVerseCard />
          </View>

          <View style={{ flex: columns ? 1 : undefined, minWidth: 0, gap: 16 }}>
            <Panel style={{ padding: mobile ? 20 : 24, gap: 16, flexGrow: 1 }}>
              <View
                style={{ flexDirection: "row", gap: 9, alignItems: "center" }}
              >
                <BookOpen size={18} color={c.green} />
                <Eyebrow color={c.green}>
                  {bi("继续阅读", "CONTINUE READING")}
                </Eyebrow>
              </View>
              <View
                style={{
                  flexDirection: "column",
                  alignItems: "stretch",
                  gap: 20,
                }}
              >
                <View style={{ gap: 8 }}>
                  <Txt
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: 22,
                      lineHeight: 32,
                    }}
                  >
                    {bi(book.zh, book.en)} {chapter}:{selectedVerse}
                  </Txt>
                  {verse && (
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily:
                          locale === "en" ? fonts.serif : fonts.regular,
                        fontSize: 15,
                        lineHeight: 25,
                        color: c.muted,
                      }}
                    >
                      {bi(verse.zh, verse.en)}
                    </Txt>
                  )}
                </View>
                <Button
                  icon={ArrowRight}
                  style={{ alignSelf: "flex-start", minHeight: 48 }}
                  onPress={() => {
                    useAppStore.getState().resumeReading();
                    router.push("/bible");
                  }}
                >
                  {bi("从这里继续", "Continue reading")}
                </Button>
              </View>
            </Panel>

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
                backgroundColor: c.lightGreen,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 14,
                  backgroundColor: c.paper,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <BookMarked size={22} color={c.green} strokeWidth={1.7} />
              </View>
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
                  {bi("我的词汇", "My vocabulary")}
                </Txt>
                <Txt
                  style={{
                    color: c.muted,
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
              <ChevronRight size={19} color={c.green} />
            </Pressable>
          </View>
        </View>

        <HomeHighlights />
      </View>
    </ScrollView>
  );
}
