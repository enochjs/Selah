import React from "react";
import { ImageBackground, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Pause, Play } from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import { formatTime } from "../../domain/playback";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, images, typeScale } from "../../shared/theme";
import { Button, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";

export function FeaturedHymnCard({
  track,
  queue,
  compact,
  landscape = false,
}: {
  track: AudioTrack;
  queue: AudioTrack[];
  compact: boolean;
  landscape?: boolean;
}) {
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const current = audio.track?.id === track.id;
  const playing = current && audio.playing;
  const duration =
    track.duration && Number.isFinite(track.duration) && track.duration > 0
      ? formatTime(track.duration)
      : null;
  return (
    <ImageBackground
      source={images.morning}
      resizeMode="cover"
      imageStyle={{ borderRadius: 20, width: "100%", height: "100%" }}
      style={{ borderRadius: 20, overflow: "hidden" }}
    >
      <LinearGradient
        colors={[c.scriptureBackdrop, "rgba(16,35,27,0.62)"]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0 }}
        style={{
          padding: landscape ? 16 : compact ? 20 : 32,
          minHeight: landscape ? 88 : compact ? 176 : 200,
          flexDirection: compact && !landscape ? "column" : "row",
          alignItems: compact && !landscape ? "stretch" : "center",
          justifyContent: "space-between",
          gap: compact ? 12 : 18,
        }}
      >
        <View
          style={{
            flex: compact && !landscape ? undefined : 1,
            minWidth: 0,
            gap: compact ? 6 : 8,
          }}
        >
          {!landscape && (
            <Txt
              style={{
                color: c.onScriptureMuted,
                fontSize: typeScale.caption,
                lineHeight: 18,
                letterSpacing: 1.5,
              }}
            >
              SELAH · {bi("精选诗歌", "IN THE SPOTLIGHT")}
            </Txt>
          )}
          <Txt
            accessibilityRole="header"
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.scriptureZh,
              fontSize: landscape ? 22 : compact ? 25 : 34,
              lineHeight: landscape ? 30 : compact ? 32 : 48,
              color: c.onScripture,
            }}
          >
            {track.title}
          </Txt>
          <Txt
            numberOfLines={compact ? 2 : 3}
            style={{
              color: c.onScriptureMuted,
              fontSize: typeScale.label,
              lineHeight: 21,
            }}
          >
            {[track.subtitle, duration].filter(Boolean).join(" · ")}
          </Txt>
        </View>
        <Button
          small
          secondary
          icon={playing ? Pause : Play}
          onPress={() =>
            current
              ? audio.toggle()
              : audio.playQueue(
                  queue,
                  queue.findIndex((item) => item.id === track.id),
                )
          }
          style={{
            alignSelf: compact && !landscape ? "flex-start" : "center",
            backgroundColor: c.onScripture,
          }}
        >
          {playing
            ? bi("暂停播放", "Pause song")
            : current
              ? bi("继续播放", "Resume song")
              : bi("播放这首", "Play this song")}
        </Button>
      </LinearGradient>
    </ImageBackground>
  );
}
