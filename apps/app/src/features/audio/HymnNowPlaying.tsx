import React, { useMemo, useState } from "react";
import {
  View,
  Image,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import Slider from "@react-native-community/slider";
import {
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Heart,
  Repeat,
  Repeat1,
  ListEnd,
  ListMusic,
} from "lucide-react-native";
import { parseLyrics } from "../../domain/lyrics";
import { formatTime } from "../../domain/playback";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, images } from "../../shared/theme";
import { IconButton, Txt } from "../../shared/ui";
import { useAudio, useAudioProgress } from "./AudioProvider";
import { LyricsView } from "./LyricsView";
import { useAppStore } from "../../state/app-store";
import { useHymns } from "./useHymns";
import { HymnDownloadButton } from "../downloads/HymnDownloadButton";

export function HymnNowPlaying({
  onRequestControls,
}: {
  onRequestControls: (section: "settings" | "queue") => void;
}) {
  const audio = useAudio();
  const progress = useAudioProgress();
  const { bi, locale } = useI18n();
  const { width, height } = useWindowDimensions();
  const mobile = width < 760;
  const shortViewport = height < 500;
  const favorites = useAppStore((state) => state.favoriteHymns);
  const toggleFavorite = useAppStore((state) => state.toggleFavoriteHymn);
  const hymns = useHymns(locale);
  const [scrub, setScrub] = useState<number | null>(null);
  const track = audio.track;
  const lyrics = useMemo(
    () => parseLyrics(track?.lyrics, progress.duration),
    [track?.lyrics, progress.duration],
  );
  if (track?.kind !== "hymn") return null;
  const saved = favorites.some((item) => item.id === track.id);
  const repeatLabel =
    audio.repeat === "verse"
      ? bi("单曲循环", "Repeat track")
      : audio.repeat === "chapter"
        ? bi("列表循环", "Repeat queue")
        : bi("顺序播放", "Repeat off");
  const artworkSize = Math.min(220, width * 0.55, height * 0.25);
  return (
    <View
      style={{
        flex: 1,
        minHeight: 0,
        backgroundColor: c.bg,
        overflow: "hidden",
        paddingHorizontal: shortViewport ? 20 : mobile ? 24 : 36,
        paddingTop: shortViewport ? 0 : 12,
        paddingBottom: shortViewport ? 10 : 24,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingBottom: shortViewport ? 4 : 20,
        }}
      >
        {!shortViewport && lyrics.lines.length > 0 && (
          <Image
            source={track.artwork ?? images.morning}
            accessibilityIgnoresInvertColors
            style={{ width: 42, height: 48, borderRadius: 10 }}
          />
        )}
        <View style={{ flex: 1, gap: 5 }}>
          <Txt
            numberOfLines={shortViewport ? 1 : 2}
            style={{
              fontSize: shortViewport ? 17 : mobile ? 17 : 20,
              lineHeight: shortViewport ? 24 : mobile ? 24 : 28,
              fontFamily: fonts.medium,
            }}
          >
            {track.title}
          </Txt>
          <Txt
            numberOfLines={1}
            style={{ fontSize: 11, lineHeight: 17, color: c.muted }}
          >
            {track.subtitle}
          </Txt>
        </View>
        {(saved || hymns.some((item) => item.id === track.id)) && (
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
            onPress={() => toggleFavorite({ id: track.id, title: track.title })}
          />
        )}
        {audio.buffering && (
          <ActivityIndicator
            color={c.green}
            accessibilityLabel={bi("正在缓冲", "Buffering")}
          />
        )}
        <HymnDownloadButton key={track.id} track={track} />
      </View>
      {lyrics.lines.length ? (
        <LyricsView
          key={`${track.id}:${track.lyrics ?? ""}`}
          lyrics={lyrics}
          position={progress.position}
          onPlayFrom={audio.playFrom}
        />
      ) : (
        <View
          style={{
            flex: 1,
            minHeight: 0,
            alignItems: "center",
            justifyContent: "center",
            gap: shortViewport ? 0 : 16,
            paddingVertical: shortViewport ? 0 : 12,
          }}
        >
          {!shortViewport && (
            <Image
              source={track.artwork ?? images.morning}
              style={{
                width: artworkSize,
                height: artworkSize,
                borderRadius: 20,
                flexShrink: 1,
              }}
            />
          )}
          <Txt style={{ color: c.muted, fontSize: 13 }}>
            {bi("暂无歌词", "No lyrics yet")}
          </Txt>
        </View>
      )}
      <View style={{ flexShrink: 0, paddingTop: shortViewport ? 0 : 12 }}>
        <Slider
          accessibilityLabel={bi("诗歌播放进度", "Song progress")}
          style={{ width: "100%", height: 32, minWidth: 44 }}
          hitSlop={{ top: 6, bottom: 6 }}
          minimumValue={0}
          maximumValue={progress.duration || 1}
          disabled={!progress.duration}
          value={scrub ?? progress.position}
          onSlidingStart={setScrub}
          onValueChange={setScrub}
          onSlidingComplete={(time) => {
            audio.seek(time);
            setScrub(null);
          }}
          minimumTrackTintColor={c.green}
          maximumTrackTintColor={c.border}
          thumbTintColor={c.green}
        />
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            paddingHorizontal: 3,
          }}
        >
          <Txt
            style={{
              color: c.muted,
              fontSize: 10,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(scrub ?? progress.position)}
          </Txt>
          <Txt
            style={{
              color: c.muted,
              fontSize: 10,
              fontVariant: ["tabular-nums"],
            }}
          >
            {formatTime(progress.duration)}
          </Txt>
        </View>
      </View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingTop: shortViewport ? 4 : 16,
          paddingHorizontal: mobile ? 0 : 20,
          flexShrink: 0,
        }}
      >
        <IconButton
          icon={
            audio.repeat === "off"
              ? ListEnd
              : audio.repeat === "verse"
                ? Repeat1
                : Repeat
          }
          label={repeatLabel}
          active={audio.repeat !== "off"}
          onPress={() =>
            audio.setRepeat(
              audio.repeat === "off"
                ? "verse"
                : audio.repeat === "verse"
                  ? "chapter"
                  : "off",
            )
          }
        />
        <IconButton
          icon={SkipBack}
          label={bi("上一曲", "Previous track")}
          onPress={audio.previous}
        />
        <IconButton
          icon={audio.playing ? Pause : Play}
          label={
            audio.playing
              ? bi("暂停诗歌", "Pause song")
              : bi("播放诗歌", "Play song")
          }
          onPress={audio.toggle}
          active
          activeStyle="surface"
          fillActive
          size={shortViewport ? 22 : 27}
          style={{
            width: shortViewport ? 48 : 64,
            height: shortViewport ? 48 : 64,
            borderRadius: 32,
          }}
        />
        <IconButton
          icon={SkipForward}
          label={bi("下一曲", "Next track")}
          onPress={audio.next}
          disabled={
            audio.index === audio.queue.length - 1 && audio.repeat !== "chapter"
          }
        />
        <IconButton
          icon={ListMusic}
          label={bi("播放队列", "Play queue")}
          onPress={() => onRequestControls("queue")}
        />
      </View>
    </View>
  );
}
