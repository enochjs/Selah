import React from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import {
  ArrowUpRight,
  ArrowRight,
  Sprout,
  Play,
  Headphones,
} from "lucide-react-native";
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
  const { width, fontScale } = useWindowDimensions();
  const contentWidth = width - (width >= 900 ? 228 : 0);
  const wide = contentWidth >= 720 && fontScale < 1.4;
  const largeText = fontScale >= 1.4;
  const progressSize = 60 * Math.max(1, fontScale ?? 1);
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
    <View style={{ gap: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.medium, fontSize: 18, flexShrink: 1 }}
        >
          {bi("一点积累，长久生长", "Small steps, lasting growth")}
        </Txt>
        <View style={{ flex: 1, height: 1, backgroundColor: c.border }} />
      </View>
      <View
        style={{
          flexDirection: wide ? "row" : "column",
          alignItems: "stretch",
          gap: 16,
        }}
      >
        <Panel
          style={{
            padding: 20,
            flex: wide ? 1 : undefined,
            width: wide ? undefined : "100%",
          }}
        >
          <Eyebrow>{bi("温故，而知新", "A LITTLE EVERY DAY")}</Eyebrow>
          <View
            style={{
              flexDirection: largeText ? "column" : "row",
              gap: 16,
              alignItems: largeText ? "flex-start" : "center",
              marginVertical: 16,
            }}
          >
            <View
              style={{
                width: progressSize,
                height: progressSize,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Svg
                width={progressSize}
                height={progressSize}
                viewBox="0 0 65 65"
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
              <Txt style={{ fontFamily: fonts.serif, fontSize: 22 }}>
                {completed}
                <Txt style={{ fontSize: typeScale.caption, color: c.muted }}>
                  /{goal}
                </Txt>
              </Txt>
            </View>
            <View style={{ flex: largeText ? undefined : 1, gap: 7 }}>
              <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
                {bi("今日单词回顾", "Your daily review")}
              </Txt>
              <Txt
                style={{
                  color: c.muted,
                  fontSize: typeScale.label,
                  lineHeight: 22,
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
            secondary
            icon={ArrowRight}
            onPress={() => router.push("/review")}
          >
            {bi("开始回顾", "Begin your review")}
          </Button>
        </Panel>
        <Panel
          style={{
            padding: 20,
            gap: 16,
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
              style={({ hovered, pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 104,
                padding: 12,
                borderRadius: 14,
                backgroundColor: hovered ? c.sidebar : "transparent",
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Image
                source={featuredHymn.artwork}
                style={{ width: 64, height: 64, borderRadius: 12 }}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 16,
                    lineHeight: 24,
                  }}
                >
                  {featuredHymn.title}
                </Txt>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontSize: typeScale.label,
                    lineHeight: 20,
                    color: c.muted,
                  }}
                >
                  {featuredHymn.subtitle}
                </Txt>
              </View>
              <View
                style={{
                  backgroundColor: c.lightGreen,
                  borderRadius: 22,
                  width: 44,
                  height: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Play size={16} color={c.green} fill={c.green} />
              </View>
            </Pressable>
          ) : (
            <View
              style={{
                flex: 1,
                minHeight: 104,
                borderRadius: 14,
                backgroundColor: c.bg,
                padding: 20,
                gap: 12,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Headphones size={26} color={c.green} strokeWidth={1.5} />
              <Txt
                style={{
                  color: c.muted,
                  fontSize: typeScale.label,
                  textAlign: "center",
                  lineHeight: 22,
                }}
              >
                {bi("暂无可用的平台诗歌", "No platform hymns available")}
              </Txt>
            </View>
          )}
        </Panel>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          justifyContent: "center",
        }}
      >
        <Sprout size={16} color={c.green} strokeWidth={1.5} />
        <Txt
          style={{
            color: c.muted,
            fontSize: typeScale.caption,
            flexShrink: 1,
            lineHeight: 20,
            textAlign: "center",
          }}
        >
          {bi("慢一点，让心灵跟上脚步。", "Slow down. Let your soul catch up.")}
        </Txt>
      </View>
    </View>
  );
}
