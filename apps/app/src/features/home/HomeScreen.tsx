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
import { ArrowRight, BookOpen } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, images, typeScale } from "../../shared/theme";
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
  const scenicVerse = bibleRepository
    .getChapter("psalms", 119)
    .find((item) => item.number === 105);
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
              {bi("愿你今天心有安宁。", "A moment of peace today.")}
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
              minHeight: mobile ? 156 : 210,
              padding: mobile ? 20 : 29,
              justifyContent: "center",
            }}
          >
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 24 : 32,
                lineHeight: mobile ? 34 : 47,
                color: "#fff",
                marginTop: 12,
              }}
            >
              {bi("静下来，听见恩典。", "Be still. Let the Word speak.")}
            </Txt>
            <Txt
              style={{
                color: "#E3E8DD",
                fontSize: typeScale.caption,
                lineHeight: 18,
                marginTop: 13,
              }}
            >
              {bi(scenicVerse?.zh ?? "", scenicVerse?.en ?? "")}
            </Txt>
            <Txt
              style={{
                color: "#E3E8DD",
                fontSize: typeScale.caption,
                letterSpacing: 1,
                alignSelf: "flex-end",
                marginTop: 12,
              }}
            >
              {bi("诗篇 119:105", "PSALM 119:105")}
            </Txt>
          </LinearGradient>
        </View>

        <HomeHighlights />
      </View>
    </ScrollView>
  );
}
