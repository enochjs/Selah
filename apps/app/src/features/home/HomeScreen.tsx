import React from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ArrowRight, BookOpen, Leaf } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, images } from "../../shared/theme";
import { Button, Eyebrow, Panel, Txt } from "../../shared/ui";
import { HomeHighlights } from "./HomeHighlights";

export function HomeScreen() {
  const mobile = useWindowDimensions().width < 760;
  const { bi, locale } = useI18n();
  const {
    bookId,
    chapter,
    verse: selectedVerse,
  } = useAppStore((s) => s.readingPosition);
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
            <Eyebrow>{bi("在话语里，遇见安静", "NOURISH YOUR SOUL")}</Eyebrow>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 25 : 29,
                letterSpacing: -0.5,
                marginTop: 9,
              }}
            >
              {bi("把心安放在话语里。", "A little stillness, every day.")}
            </Txt>
          </View>
          <View
            style={{ alignItems: mobile ? "flex-start" : "flex-end", gap: 5 }}
          >
            <Txt style={{ color: c.muted, fontSize: 11 }}>
              {new Date().toLocaleDateString(
                locale === "zh" ? "zh-CN" : "en-US",
                { month: "long", day: "numeric", weekday: "long" },
              )}
            </Txt>
            {!mobile && (
              <View
                style={{ flexDirection: "row", gap: 5, alignItems: "center" }}
              >
                <Leaf size={11} color="#929B85" />
                <Txt style={{ fontSize: 9, color: "#929B85" }}>
                  {bi("今天，也有新的恩典", "New mercies, this morning")}
                </Txt>
              </View>
            )}
          </View>
        </View>

        <View
          style={{
            overflow: "hidden",
            borderRadius: 15,
            backgroundColor: c.green,
          }}
        >
          <Image
            source={images.lake}
            resizeMode="cover"
            style={[StyleSheet.absoluteFill, { width: "100%", height: "100%" }]}
          />
          <LinearGradient
            colors={["rgba(25,48,35,.72)", "rgba(32,48,36,.19)"]}
            start={{ x: 0, y: 0.6 }}
            end={{ x: 1, y: 0 }}
            style={{
              minHeight: mobile ? 225 : 188,
              padding: mobile ? 24 : 29,
              justifyContent: "center",
            }}
          >
            <View
              style={{ flexDirection: "row", gap: 7, alignItems: "center" }}
            >
              <View
                style={{ width: 17, height: 1, backgroundColor: "#D8E2CC" }}
              />
              <View style={{ flex: 1 }}>
                <Eyebrow color="#DBE4D1">PAUSE. BREATHE. BE PRESENT.</Eyebrow>
              </View>
            </View>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 27 : 32,
                lineHeight: mobile ? 40 : 47,
                color: "#fff",
                marginTop: 12,
              }}
            >
              {bi(
                mobile ? "静下来，\n听见恩典。" : "静下来，听见恩典。",
                mobile
                  ? "Be still.\nLet the Word speak."
                  : "Be still. Let the Word speak.",
              )}
            </Txt>
            <Txt
              style={{
                color: "#E3E8DD",
                fontSize: 11,
                lineHeight: 18,
                marginTop: 13,
              }}
            >
              {bi(
                "你的话是我脚前的灯，是我路上的光。",
                "Your word is a lamp for my feet, a light on my path.",
              )}
            </Txt>
            <Txt
              style={{
                color: "#E3E8DD",
                fontSize: 9,
                letterSpacing: 1,
                alignSelf: "flex-end",
                marginTop: 12,
              }}
            >
              {bi("诗篇 119:105", "PSALM 119:105")}
            </Txt>
          </LinearGradient>
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

        <HomeHighlights />
      </View>
    </ScrollView>
  );
}
