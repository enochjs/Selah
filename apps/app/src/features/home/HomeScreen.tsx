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

export function HomeScreen() {
  const mobile = useWindowDimensions().width < 760;
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
        padding: mobile ? 19 : 34,
        paddingTop: mobile ? 25 : 29,
        paddingBottom: 45,
      }}
    >
      <View
        style={{ maxWidth: 1180, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <View
          style={{
            flexDirection: mobile ? "column" : "row",
            justifyContent: "space-between",
            alignItems: mobile ? "flex-start" : "center",
            gap: 14,
            marginBottom: 2,
          }}
        >
          <View style={{ flexShrink: 1 }}>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 22 : 26,
                letterSpacing: -0.5,
                marginTop: 0,
              }}
            >
              {bi("在神的话语中，寻得平安。", "A little stillness, every day.")}
            </Txt>
          </View>
          <View
            style={{ alignItems: mobile ? "flex-start" : "flex-end", gap: 5 }}
          >
            <Txt style={{ color: c.muted, fontSize: typeScale.caption }}>
              {new Date().toLocaleDateString(
                locale === "zh" ? "zh-CN" : "en-US",
                { month: "long", day: "numeric", weekday: "long" },
              )}
            </Txt>
          </View>
        </View>

        <Panel style={{ padding: mobile ? 22 : 28, gap: 20 }}>
          <View style={{ flexDirection: "row", gap: 9, alignItems: "center" }}>
            <BookOpen size={18} color={c.green} />
            <Eyebrow color={c.green}>
              {bi("继续阅读", "CONTINUE READING")}
            </Eyebrow>
          </View>
          <View
            style={{
              flexDirection: mobile ? "column" : "row",
              alignItems: mobile ? "stretch" : "center",
              gap: 28,
            }}
          >
            <View style={{ flex: 1, gap: 12 }}>
              <Txt style={{ fontFamily: fonts.medium, fontSize: 21 }}>
                {bi(book.zh, book.en)} {chapter}:{selectedVerse}
              </Txt>
              {verse && (
                <Txt
                  numberOfLines={3}
                  style={{
                    fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                    fontSize: 16,
                    lineHeight: 27,
                    color: c.muted,
                  }}
                >
                  {bi(verse.zh, verse.en)}
                </Txt>
              )}
            </View>
            <Button
              icon={ArrowRight}
              onPress={() => {
                useAppStore.getState().resumeReading();
                router.push("/bible");
              }}
            >
              {bi("从这里继续", "Pick up where you left off")}
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
            gap: 16,
            padding: 20,
            borderRadius: 15,
            borderWidth: 1,
            borderColor: c.border,
            backgroundColor: c.lightGreen,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <BookMarked size={24} color={c.green} strokeWidth={1.5} />
          <View style={{ flex: 1, gap: 7 }}>
            <Txt style={{ fontFamily: fonts.medium, fontSize: 17 }}>
              {bi("我的词汇", "My vocabulary")}
            </Txt>
            <Txt
              style={{
                color: c.muted,
                fontSize: typeScale.caption,
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

        <HomeHighlights />
      </View>
    </ScrollView>
  );
}
