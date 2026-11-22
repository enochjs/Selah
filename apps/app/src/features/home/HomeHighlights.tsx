import React from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import {
  ArrowUpRight,
  ArrowRight,
  Sprout,
  Play,
  Pause,
  Headphones,
} from "lucide-react-native";
import Svg, { Circle } from "react-native-svg";
import { router } from "expo-router";
import { fonts, typeScale } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt, Panel, Eyebrow, Button, IconButton } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { dueWords, localDateKey } from "../../domain/vocabulary";
import { useAudio } from "../audio/AudioProvider";
import { useHymns } from "../audio/useHymns";
import { HomeCard, HomeCardTitle } from "./HomeCard";

export function HomeHighlights() {
  const { colors: c } = useTheme();
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale >= 1.4;
  const progressSize = 60 * Math.max(1, fontScale ?? 1);
  const { bi } = useI18n();
  const words = useAppStore((s) => s.words),
    reviews = useAppStore((s) => s.reviews),
    goal = useAppStore((s) => s.dailyGoal);
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
      <Panel
        style={{
          padding: 20,
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
                stroke={c.primarySoft}
                strokeWidth={4}
              />
              <Circle
                cx={32.5}
                cy={32.5}
                r={28}
                fill="none"
                stroke={c.primary}
                strokeWidth={4}
                strokeDasharray={`${Math.min(1, completed / goal) * 176} 176`}
                strokeLinecap="round"
              />
            </Svg>
            <Txt style={{ fontFamily: fonts.serif, fontSize: 22 }}>
              {completed}
              <Txt style={{ fontSize: typeScale.caption, color: c.textMuted }}>
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
                color: c.textMuted,
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
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 7,
          justifyContent: "center",
        }}
      >
        <Sprout size={16} color={c.primary} strokeWidth={1.5} />
        <Txt
          style={{
            color: c.textMuted,
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

export function HomeWorship() {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const hymnQueue = useHymns(locale);
  const featuredHymn = hymnQueue[0];
  const current = !!featuredHymn && audio.track?.id === featuredHymn.id;
  const playing = current && audio.playing;
  const PlaybackIcon = playing ? Pause : Play;
  return (
    <HomeCard
      label={bi("此刻的赞美", "A MOMENT OF WORSHIP")}
      action={
        <IconButton
          icon={ArrowUpRight}
          size={15}
          label={bi("更多赞美诗", "More hymns")}
          onPress={() => router.push("/music")}
        />
      }
    >
      {featuredHymn ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            playing
              ? bi(`暂停${featuredHymn.title}`, `Pause ${featuredHymn.title}`)
              : current
                ? bi(
                    `继续播放${featuredHymn.title}`,
                    `Resume ${featuredHymn.title}`,
                  )
                : bi(`播放${featuredHymn.title}`, `Play ${featuredHymn.title}`)
          }
          onPress={() =>
            current ? audio.toggle() : audio.playQueue(hymnQueue, 0)
          }
          style={({ hovered, pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            borderRadius: 12,
            backgroundColor: hovered ? c.surfaceMuted : "transparent",
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Image
            source={featuredHymn.artwork}
            style={{ width: 52, height: 52, borderRadius: 10 }}
          />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <HomeCardTitle>{featuredHymn.title}</HomeCardTitle>
            <Txt
              numberOfLines={1}
              style={{
                fontSize: typeScale.label,
                lineHeight: 20,
                color: c.textMuted,
              }}
            >
              {featuredHymn.subtitle}
            </Txt>
          </View>
          <View
            style={{
              backgroundColor: playing ? c.primary : c.primarySoft,
              borderRadius: 19,
              width: 38,
              height: 38,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <PlaybackIcon
              size={16}
              color={playing ? c.onPrimary : c.primary}
              fill={playing ? c.onPrimary : c.primary}
            />
          </View>
        </Pressable>
      ) : (
        <View
          style={{
            flexDirection: "row",
            minHeight: 44,
            gap: 10,
            alignItems: "center",
          }}
        >
          <Headphones size={20} color={c.primary} strokeWidth={1.5} />
          <Txt
            style={{
              color: c.textMuted,
              fontSize: typeScale.label,
              flex: 1,
              lineHeight: 22,
            }}
          >
            {bi("暂无可用的平台诗歌", "No platform hymns available")}
          </Txt>
        </View>
      )}
    </HomeCard>
  );
}
