import React, { useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import Slider from "@react-native-community/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  ListMusic,
  AudioLines,
  Heart,
} from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { CurrentLyric } from "./CurrentLyric";
import { RecordArtwork } from "./RecordArtwork";
import { AudioControlsDialog } from "./AudioControlsDialog";
import { HymnRepeatButton } from "./HymnRepeatControl";
import { compactPlayerLayout } from "./compact-player-layout";
import { router } from "expo-router";
import { useHymns } from "./useHymns";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, IconButton } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
export function PlayerBar() {
  const audio = useAudio();
  const { bi, locale } = useI18n();
  const hymns = useHymns(locale);
  const favorites = useAppStore((s) => s.favoriteHymns);
  const toggleFavorite = useAppStore((s) => s.toggleFavoriteHymn);
  const { width, fontScale = 1 } = useWindowDimensions();
  const compact = width < 760;
  const narrow = width < 350;
  const compactLayout = compactPlayerLayout(fontScale);
  const [controlsSection, setControlsSection] = useState<
    "settings" | "queue" | null
  >(null);
  const track = audio.track;
  if (track?.kind !== "hymn") return null;
  const saved = favorites.some((hymn) => hymn.id === track.id);
  const platformHymn = saved || hymns.some((hymn) => hymn.id === track.id);
  return (
    <>
      <View
        style={{
          flexShrink: 0,
          backgroundColor: compact ? c.bg : undefined,
          paddingHorizontal: compact ? (narrow ? 8 : 12) : 0,
          paddingVertical: compact ? 4 : 0,
        }}
      >
        <View
          style={{
            backgroundColor: c.paper,
            borderWidth: compact ? 1 : 0,
            borderTopWidth: 1,
            borderColor: c.border,
            borderTopColor: c.border,
            borderRadius: compact ? 14 : 0,
            paddingHorizontal: compact ? (narrow ? 6 : 8) : 28,
            paddingVertical: compact ? 6 : 16,
            minHeight: compact ? compactLayout.height + 14 : undefined,
            flexShrink: 0,
            flexDirection: "row",
            alignItems: "center",
            gap: compact ? (narrow ? 4 : 8) : 0,
          }}
        >
          {compact && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi(
                `打开播放器：${track.title}`,
                `Open player: ${track.title}`,
              )}
              onPress={() => router.push("/now-playing")}
              style={({ pressed }) => ({
                width: 44,
                minHeight: compactLayout.height,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <RecordArtwork
                key={track.id}
                source={track.artwork ?? images.lake}
                size={36}
                ringWidth={1}
                playing={audio.playing && !audio.buffering}
              />
            </Pressable>
          )}
          <View
            style={{
              flex: 1,
              minWidth: 0,
              flexDirection: "row",
              alignItems: "center",
            }}
          >
            <View
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: compact ? compactLayout.height : undefined,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: compact ? 0 : 18,
                  minHeight: compact ? compactLayout.height : 44,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    gap: 12,
                    alignItems: "center",
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={bi(
                      `查看 ${track.title} 的歌词`,
                      `Show lyrics for ${track.title}`,
                    )}
                    onPress={() => router.push("/now-playing")}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: 0,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: compact ? 8 : 12,
                      minHeight: compact ? compactLayout.height : 44,
                      paddingBottom: compact
                        ? compactLayout.titleBottomPadding
                        : 0,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    {!compact && (
                      <RecordArtwork
                        key={track.id}
                        source={track.artwork ?? images.lake}
                        size={42}
                        playing={audio.playing && !audio.buffering}
                      />
                    )}
                    <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                      <Txt
                        numberOfLines={1}
                        style={{
                          fontFamily: compact ? fonts.medium : fonts.bold,
                          fontSize: compact ? 14 : 13,
                          lineHeight: compact ? 20 : undefined,
                        }}
                      >
                        {track.title}
                      </Txt>
                      {!compact && <CurrentLyric />}
                    </View>
                  </Pressable>
                  {!compact && platformHymn && (
                    <IconButton
                      icon={Heart}
                      active={saved}
                      activeStyle="icon"
                      fillActive
                      label={
                        saved
                          ? bi(
                              `取消收藏 ${track.title}`,
                              `Unfavorite ${track.title}`,
                            )
                          : bi(`收藏 ${track.title}`, `Favorite ${track.title}`)
                      }
                      onPress={() =>
                        toggleFavorite({ id: track.id, title: track.title })
                      }
                    />
                  )}
                  {!compact && (
                    <AudioLines
                      size={17}
                      color={audio.playing ? c.green : c.border}
                    />
                  )}
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    flex: compact ? undefined : 1,
                    flexShrink: 0,
                    gap: compact ? 0 : 17,
                  }}
                >
                  <IconButton
                    icon={SkipBack}
                    onPress={audio.previous}
                    label={bi("上一曲", "Previous track")}
                    size={compact ? 17 : 18}
                    disabled={!audio.track}
                    style={
                      compact
                        ? {
                            width: 44,
                            height: compactLayout.height,
                            paddingBottom: compactLayout.titleBottomPadding,
                          }
                        : undefined
                    }
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      audio.playing ? bi("暂停", "Pause") : bi("播放", "Play")
                    }
                    onPress={audio.toggle}
                    style={({ pressed }) => ({
                      width: 44,
                      height: compact ? compactLayout.height : 44,
                      paddingBottom: compact
                        ? compactLayout.titleBottomPadding
                        : 0,
                      alignItems: "center",
                      justifyContent: "center",
                      opacity: pressed ? 0.75 : 1,
                    })}
                  >
                    <View
                      style={{
                        width: 44,
                        height: compact
                          ? compactLayout.height -
                            compactLayout.titleBottomPadding
                          : 44,
                        borderRadius: 22,
                        backgroundColor: compact ? "transparent" : c.green,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {audio.playing ? (
                        <Pause
                          size={compact ? 18 : 17}
                          color={compact ? c.green : c.paper}
                          fill={compact ? c.green : c.paper}
                        />
                      ) : (
                        <Play
                          size={compact ? 18 : 17}
                          color={compact ? c.green : c.paper}
                          fill={compact ? c.green : c.paper}
                          style={{ marginLeft: 2 }}
                        />
                      )}
                    </View>
                  </Pressable>
                  <IconButton
                    icon={SkipForward}
                    onPress={audio.next}
                    label={bi("下一曲", "Next track")}
                    size={compact ? 17 : 18}
                    style={
                      compact
                        ? {
                            width: 44,
                            height: compactLayout.height,
                            paddingBottom: compactLayout.titleBottomPadding,
                          }
                        : undefined
                    }
                    disabled={
                      !audio.track ||
                      (audio.index === audio.queue.length - 1 &&
                        audio.repeat !== "chapter")
                    }
                  />
                </View>
                {!compact && (
                  <View
                    style={{
                      flex: compact ? undefined : 1,
                      flexDirection: "row",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      gap: compact ? 0 : 8,
                    }}
                  >
                    {!compact && (
                      <Pressable
                        onPress={() => setControlsSection("settings")}
                        accessibilityRole="button"
                        accessibilityLabel={bi(
                          `播放速度，当前 ${audio.rate} 倍`,
                          `Playback speed, currently ${audio.rate} times`,
                        )}
                        style={({ pressed }) => ({
                          minWidth: 44,
                          height: 44,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 12,
                          backgroundColor:
                            audio.rate !== 1 ? c.lightGreen : "transparent",
                          opacity: pressed ? 0.65 : 1,
                        })}
                      >
                        <Txt
                          style={{
                            fontSize: 12,
                            color: audio.rate !== 1 ? c.green : c.muted,
                          }}
                        >
                          {audio.rate}×
                        </Txt>
                      </Pressable>
                    )}
                    {width > 1150 && (
                      <>
                        <Volume2 size={16} color={c.muted} />
                        <Slider
                          accessibilityLabel={bi("音量", "Volume")}
                          style={{ width: 73, minWidth: 44, height: 44 }}
                          hitSlop={{ top: 12, bottom: 12 }}
                          minimumValue={0}
                          maximumValue={1}
                          value={audio.volume}
                          onValueChange={audio.setVolume}
                          minimumTrackTintColor={c.green}
                          maximumTrackTintColor={c.border}
                          thumbTintColor={c.green}
                        />
                      </>
                    )}
                    <HymnRepeatButton
                      repeat={audio.repeat}
                      onChange={audio.setRepeat}
                    />
                    {!compact && (
                      <IconButton
                        icon={ListMusic}
                        onPress={() => setControlsSection("queue")}
                        label={bi("播放队列", "Play queue")}
                        size={18}
                      />
                    )}
                  </View>
                )}
              </View>
              {compact && (
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    top: compactLayout.detailTop,
                    minWidth: 0,
                    paddingRight: 8,
                  }}
                >
                  <CurrentLyric compact />
                </View>
              )}
            </View>
            {compact && (
              <HymnRepeatButton
                repeat={audio.repeat}
                compact
                fontScale={fontScale}
                onChange={audio.setRepeat}
              />
            )}
          </View>
        </View>
      </View>
      <AudioControlsDialog
        visible={controlsSection === "settings" || controlsSection === "queue"}
        initialSection={controlsSection === "queue" ? "queue" : "settings"}
        onClose={() => setControlsSection(null)}
      />
    </>
  );
}
