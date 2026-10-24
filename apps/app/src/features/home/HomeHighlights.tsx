import React from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import {
  ArrowUpRight,
  ArrowRight,
  Sprout,
  Play,
  Quote,
  Bookmark,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { router } from "expo-router";
import { colors as c, fonts, images } from "../../shared/theme";
import { Txt, Panel, Eyebrow, Button, IconButton } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { dueWords, localDateKey } from "../../domain/vocabulary";
import { useAudio } from "../audio/AudioProvider";
import { hymns } from "../audio/catalog";
import { bibleRepository } from "../../data/bible-repository";

const featuredReference = { bookId: "john", chapter: 8, verse: 12 };
export function HomeHighlights() {
  const wide = useWindowDimensions().width >= 1180;
  const { bi, locale } = useI18n();
  const words = useAppStore((s) => s.words),
    reviews = useAppStore((s) => s.reviews),
    goal = useAppStore((s) => s.dailyGoal);
  const audio = useAudio();
  const completed = new Set(
    reviews
      .filter(
        (r) =>
          r.rating !== "again" &&
          localDateKey(new Date(r.at)) === localDateKey(),
      )
      .map((r) => r.wordId),
  ).size;
  const due = dueWords(words).length;
  const bookmarks = useAppStore((s) => s.bookmarks);
  const dailyBook = bibleRepository.getBook(featuredReference.bookId);
  const dailyVerse = bibleRepository
    .getChapter(featuredReference.bookId, featuredReference.chapter)
    .find((verse) => verse.number === featuredReference.verse);
  const dailyKey = `${featuredReference.bookId}:${featuredReference.chapter}:${featuredReference.verse}`;
  const dailySaved = bookmarks.includes(dailyKey);
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: "flex-start",
          gap: 20,
        }}
      >
        {dailyVerse && (
          <Panel
            style={{
              backgroundColor: c.sand,
              borderColor: "#EBE4D6",
              padding: 24,
              flex: wide ? 1.2 : undefined,
              width: wide ? undefined : "100%",
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Eyebrow color={c.gold}>
                {bi("今日的一束光", "A LIGHT FOR TODAY")}
              </Eyebrow>
              <Quote size={22} color="#C5AE88" fill="#C5AE8820" />
            </View>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: 18,
                lineHeight: 31,
                marginTop: 22,
              }}
            >
              {bi(dailyVerse.zh, dailyVerse.en)}
            </Txt>
            <Txt
              style={{
                color: "#999080",
                fontSize: 11,
                lineHeight: 20,
                marginTop: 15,
              }}
            >
              {bi(dailyVerse.en, dailyVerse.zh)}
            </Txt>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginTop: 20,
              }}
            >
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  useAppStore
                    .getState()
                    .setChapter(
                      featuredReference.bookId,
                      featuredReference.chapter,
                      featuredReference.verse,
                    );
                  router.push("/bible");
                }}
              >
                <Txt style={{ color: c.gold, fontSize: 11 }}>
                  {bi(dailyBook.zh, dailyBook.en)} {featuredReference.chapter}:
                  {featuredReference.verse}
                </Txt>
              </Pressable>
              <IconButton
                icon={Bookmark}
                active={dailySaved}
                onPress={() => useAppStore.getState().toggleBookmark(dailyKey)}
                label={bi("收藏今日经文", "Save verse of the day")}
                style={{ width: 28, height: 28 }}
                size={15}
              />
            </View>
          </Panel>
        )}
        <Panel
          style={{
            padding: 22,
            flex: wide ? 1 : undefined,
            width: wide ? undefined : "100%",
          }}
        >
          <Eyebrow>{bi("温故，而知新", "A LITTLE EVERY DAY")}</Eyebrow>
          <View
            style={{
              flexDirection: "row",
              gap: 16,
              alignItems: "center",
              marginVertical: 22,
            }}
          >
            <View
              style={{
                width: 65,
                height: 65,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg
                width={65}
                height={65}
                style={{
                  position: "absolute",
                  transform: [{ rotate: "-90deg" }],
                }}
              >
                <Circle
                  cx={32.5}
                  cy={32.5}
                  r={28}
                  fill="none"
                  stroke={c.lightGreen}
                  strokeWidth={4}
                />
                <Circle
                  cx={32.5}
                  cy={32.5}
                  r={28}
                  fill="none"
                  stroke={c.green}
                  strokeWidth={4}
                  strokeDasharray={`${Math.min(1, completed / goal) * 176} 176`}
                  strokeLinecap="round"
                />
              </Svg>
              <Txt style={{ fontFamily: fonts.serif, fontSize: 21 }}>
                {completed}
                <Txt style={{ fontSize: 11, color: c.muted }}>/{goal}</Txt>
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Txt style={{ fontFamily: fonts.bold, fontSize: 14 }}>
                {bi("今日单词回顾", "Your daily review")}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 11, lineHeight: 18 }}>
                {bi(
                  `${due} 个单词，等待与你重逢`,
                  `${due} words ready to meet again`,
                )}
              </Txt>
            </View>
          </View>
          <Button
            small
            icon={ArrowRight}
            onPress={() => router.push("/review")}
          >
            {bi("开始回顾", "Begin your review")}
          </Button>
          <Txt
            style={{
              color: c.muted,
              fontSize: 10,
              marginTop: 12,
              textAlign: "center",
            }}
          >
            {bi("一点积累，长久生长。", "Small steps. Lasting growth.")}
          </Txt>
        </Panel>
        <Panel
          style={{
            padding: 22,
            gap: 15,
            flex: wide ? 1 : undefined,
            width: wide ? undefined : "100%",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Eyebrow>{bi("此刻的赞美", "A MOMENT OF WORSHIP")}</Eyebrow>
            <IconButton
              icon={ArrowUpRight}
              size={15}
              label={bi("更多赞美诗", "More hymns")}
              onPress={() => router.push("/music")}
              style={{ width: 25, height: 25 }}
            />
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi("播放奇异恩典", "Play Amazing Grace")}
            onPress={() => audio.playQueue(hymns(locale), 0)}
            style={({ hovered }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 13,
              padding: 10,
              margin: -10,
              borderRadius: 10,
              backgroundColor: hovered ? c.sidebar : "transparent",
            })}
          >
            <Image
              source={images.morning}
              style={{ width: 55, height: 61, borderRadius: 7 }}
            />
            <View style={{ flex: 1, gap: 7 }}>
              <Txt style={{ fontFamily: fonts.medium, fontSize: 13 }}>
                {bi("奇异恩典", "Amazing Grace")}
              </Txt>
              <Txt style={{ fontSize: 10, color: c.muted }}>
                {bi("传统赞美诗 · 纯音乐", "Traditional · Instrumental")}
              </Txt>
            </View>
            <View
              style={{
                backgroundColor: c.lightGreen,
                borderRadius: 17,
                padding: 10,
              }}
            >
              <Play size={12} color={c.green} fill={c.green} />
            </View>
          </Pressable>
        </Panel>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          paddingTop: 12,
        }}
      >
        <Sprout size={13} color="#A5AC99" />
        <Txt style={{ color: "#A5AC99", fontSize: 9, letterSpacing: 0.5 }}>
          SLOW DOWN. LET YOUR SOUL CATCH UP.
        </Txt>
      </View>
    </View>
  );
}
