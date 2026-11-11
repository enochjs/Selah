import React, { useState } from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import Slider from "@react-native-community/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  ListEnd,
  Volume2,
  ListMusic,
  AudioLines,
  Heart,
} from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { AudioControlsDialog } from "./AudioControlsDialog";
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
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [controlsSection, setControlsSection] = useState<
    "settings" | "queue" | null
  >(null);
  const track = audio.track;
  if (track?.kind !== "hymn") return null;
  const saved = favorites.some((hymn) => hymn.id === track.id);
  const platformHymn = saved || hymns.some((hymn) => hymn.id === track.id);
  const repeatLabel =
    audio.repeat === "verse"
      ? bi("单曲循环", "Repeat track")
      : audio.repeat === "chapter"
        ? bi("列表循环", "Repeat queue")
        : bi("顺序播放", "Repeat off");
  const cycleRepeat = () =>
    audio.setRepeat(
      audio.repeat === "off"
        ? "verse"
        : audio.repeat === "verse"
          ? "chapter"
          : "off",
    );
  return (
    <>
      <View
        style={{
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: c.border,
          paddingHorizontal: compact ? 10 : 28,
          paddingVertical: compact ? 8 : 16,
          height: compact ? 64 : undefined,
          flexDirection: "row",
          flexWrap: "nowrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: compact ? 8 : 18,
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
          <Image
            source={track.artwork ?? images.lake}
            style={{
              width: compact ? 40 : 42,
              height: compact ? 40 : 42,
              borderRadius: 9,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi(
              `查看 ${track.title} 的歌词`,
              `Show lyrics for ${track.title}`,
            )}
            onPress={() => router.push("/now-playing")}
            style={{ flex: 1, gap: 5, minHeight: 44, justifyContent: "center" }}
          >
            <Txt
              numberOfLines={1}
              style={{ fontFamily: fonts.bold, fontSize: 13 }}
            >
              {track.title}
            </Txt>
            <Txt numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
              {bi("歌词 · 播放详情", "Lyrics · Now playing")}
            </Txt>
          </Pressable>
          {!compact && platformHymn && (
            <IconButton
              icon={Heart}
              active={saved}
              activeStyle="icon"
              fillActive
              label={
                saved
                  ? bi(`取消收藏 ${track.title}`, `Unfavorite ${track.title}`)
                  : bi(`收藏 ${track.title}`, `Favorite ${track.title}`)
              }
              onPress={() =>
                toggleFavorite({ id: track.id, title: track.title })
              }
            />
          )}
          {!compact && (
            <AudioLines size={17} color={audio.playing ? c.green : c.border} />
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            flex: compact ? undefined : 1,
            gap: compact ? 2 : 17,
          }}
        >
          {!compact && (
            <IconButton
              icon={SkipBack}
              onPress={audio.previous}
              label={bi("上一曲", "Previous track")}
              size={compact ? 16 : 18}
              disabled={!audio.track}
              style={compact ? { width: 44, height: 44 } : undefined}
            />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              audio.playing ? bi("暂停", "Pause") : bi("播放", "Play")
            }
            onPress={audio.toggle}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.green,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {audio.playing ? (
              <Pause size={17} color="#fff" fill="#fff" />
            ) : (
              <Play
                size={17}
                color="#fff"
                fill="#fff"
                style={{ marginLeft: 2 }}
              />
            )}
          </Pressable>
          {!compact && (
            <IconButton
              icon={SkipForward}
              onPress={audio.next}
              label={bi("下一曲", "Next track")}
              size={compact ? 16 : 18}
              style={compact ? { width: 44, height: 44 } : undefined}
              disabled={
                !audio.track ||
                (audio.index === audio.queue.length - 1 &&
                  audio.repeat !== "chapter")
              }
            />
          )}
        </View>
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
            <IconButton
              icon={
                audio.repeat === "off"
                  ? ListEnd
                  : audio.repeat === "verse"
                    ? Repeat1
                    : Repeat
              }
              onPress={cycleRepeat}
              label={repeatLabel}
              active={audio.repeat !== "off"}
              size={16}
              style={compact ? { width: 44, height: 44 } : undefined}
            />
          )}
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
          <IconButton
            icon={ListMusic}
            onPress={() => setControlsSection("queue")}
            label={bi("播放队列", "Play queue")}
            size={18}
            style={compact ? { width: 44, height: 44 } : undefined}
          />
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
