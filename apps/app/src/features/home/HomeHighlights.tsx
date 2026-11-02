import React from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import { ArrowUpRight, ArrowRight, Sprout, Play } from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { router } from "expo-router";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Txt, Panel, Eyebrow, Button, IconButton } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { dueWords, localDateKey } from "../../domain/vocabulary";
import { useAudio } from "../audio/AudioProvider";
import { useHymns } from "../audio/useHymns";

export function HomeHighlights() {
  const wide = useWindowDimensions().width >= 1180;
  const { bi, locale } = useI18n();
  const words = useAppStore((s) => s.words),
    reviews = useAppStore((s) => s.reviews),
    goal = useAppStore((s) => s.dailyGoal);
  const audio = useAudio();
  const hymnQueue = useHymns(locale);
  const featuredHymn = hymnQueue[0];
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
  return (
    <View style={{ gap: 20 }}>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: "flex-start",
          gap: 20,
        }}
      >
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
                <Txt style={{ fontSize: typeScale.caption, color: c.muted }}>
                  /{goal}
                </Txt>
              </Txt>
            </View>
            <View style={{ flex: 1, gap: 7 }}>
              <Txt style={{ fontFamily: fonts.bold, fontSize: 14 }}>
                {bi("今日单词回顾", "Your daily review")}
              </Txt>
              <Txt
                style={{
                  color: c.muted,
                  fontSize: typeScale.caption,
                  lineHeight: 18,
                }}
              >
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
              fontSize: typeScale.caption,
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
            />
          </View>
          {featuredHymn ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi(
                `播放${featuredHymn.title}`,
                `Play ${featuredHymn.title}`,
              )}
              onPress={() => audio.playQueue(hymnQueue, 0)}
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
                source={featuredHymn.artwork}
                style={{ width: 55, height: 61, borderRadius: 7 }}
              />
              <View style={{ flex: 1, gap: 7 }}>
                <Txt style={{ fontFamily: fonts.medium, fontSize: 13 }}>
                  {featuredHymn.title}
                </Txt>
                <Txt style={{ fontSize: typeScale.caption, color: c.muted }}>
                  {featuredHymn.subtitle}
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
          ) : (
            <Txt style={{ color: c.muted, fontSize: 12 }}>
              {bi("暂无可用的平台诗歌", "No platform hymns available")}
            </Txt>
          )}
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
        <Txt
          style={{
            color: c.muted,
            fontSize: typeScale.caption,
            letterSpacing: 0.5,
          }}
        >
          SLOW DOWN. LET YOUR SOUL CATCH UP.
        </Txt>
      </View>
    </View>
  );
}
