import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { X, Play, Pause } from "lucide-react-native";
import { useHymnCatalog } from "./useHymns";
import { useAudio } from "./AudioProvider";
import { useI18n } from "../../shared/i18n";
import { fonts, typeScale } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, Dialog, IconButton, Txt, inputStyle } from "../../shared/ui";
import { formatTime } from "../../domain/playback";

export function HymnSearchDialog({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const mobile = useWindowDimensions().width < 900;
  const { tracks, status, refresh } = useHymnCatalog(locale);
  const audio = useAudio();
  const [query, setQuery] = useState("");
  const pending = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) pending.current = null;
  }, [visible]);
  const keyword = query.normalize("NFKC").trim().toLowerCase();
  const results = keyword
    ? tracks.filter((track) =>
        [
          track.title,
          track.subtitle,
          track.hymn?.artist,
          track.hymn?.titleZh,
          track.hymn?.titleEn,
          track.hymn?.subtitleZh,
          track.hymn?.subtitleEn,
        ]
          .join(" ")
          .normalize("NFKC")
          .toLowerCase()
          .includes(keyword),
      )
    : [];
  const loading = status === "loading" && !tracks.length;
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={bi("搜索诗歌", "Search songs")}
      width={650}
      presentation={mobile ? "bottom" : "center"}
      heightMode="large"
      keyboardAware
      scrollable={false}
      onDismiss={() => {
        const play = pending.current;
        pending.current = null;
        play?.();
      }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TextInput
            accessibilityLabel={bi("搜索诗歌", "Search songs")}
            autoFocus
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            placeholder={bi("输入歌名或演唱者", "Enter a song title or artist")}
            placeholderTextColor={c.textMuted}
            style={[inputStyle(c), { flex: 1, minWidth: 0 }]}
          />
          {query.length > 0 && (
            <IconButton
              icon={X}
              label={bi("清空搜索", "Clear search")}
              onPress={() => setQuery("")}
            />
          )}
        </View>
        {status === "offline" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Txt
              style={{
                color: c.textMuted,
                fontSize: typeScale.caption,
                flex: 1,
              }}
            >
              {bi(
                "当前使用已缓存的歌库，可重试更新。",
                "Using the cached library. Retry to update.",
              )}
            </Txt>
            <Button
              small
              secondary
              onPress={() => {
                void refresh();
              }}
            >
              {bi("重试", "Retry")}
            </Button>
          </View>
        )}
        <Txt
          accessibilityLiveRegion="polite"
          style={{
            color: c.textMuted,
            fontSize: typeScale.caption,
            paddingBottom: 12,
          }}
        >
          {loading
            ? bi("正在加载诗歌…", "Loading songs…")
            : keyword
              ? bi(
                  `找到 ${results.length} 首诗歌`,
                  `${results.length} songs found`,
                )
              : bi(
                  "输入歌名或演唱者，搜索全部诗歌。",
                  "Search all songs by title or artist.",
                )}
        </Txt>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
      >
        {keyword && !loading && !results.length && (
          <Txt
            style={{ color: c.textMuted, lineHeight: 24, paddingVertical: 20 }}
          >
            {bi(
              "没有匹配的诗歌，试试其他歌名或演唱者。",
              "No matching songs. Try another title or artist.",
            )}
          </Txt>
        )}
        {results.map((track, index) => {
          const current = audio.track?.id === track.id;
          const playing = current && audio.playing;
          const PlaybackIcon = playing ? Pause : Play;
          const label = `${track.title} · ${track.subtitle}`;
          return (
            <Pressable
              key={track.id}
              accessibilityRole="button"
              accessibilityLabel={
                playing
                  ? bi(`暂停 ${label}`, `Pause ${label}`)
                  : bi(`播放 ${label}`, `Play ${label}`)
              }
              onPress={() => {
                pending.current = () => {
                  if (current) audio.toggle();
                  else audio.playQueue(results, index);
                };
                onClose();
              }}
              style={({ hovered, pressed }) => ({
                minHeight: 76,
                flexDirection: "row",
                alignItems: "center",
                gap: 16,
                paddingVertical: 16,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderColor: c.border,
                backgroundColor: current || hovered ? c.primarySoft : c.surface,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                <Txt
                  numberOfLines={2}
                  style={{
                    fontFamily: fonts.medium,
                    color: current ? c.primary : c.text,
                    lineHeight: 23,
                  }}
                >
                  {track.title}
                </Txt>
                <Txt
                  numberOfLines={2}
                  style={{
                    color: c.textMuted,
                    fontSize: typeScale.caption,
                    lineHeight: 20,
                  }}
                >
                  {formatTime(track.duration ?? 0)} · {track.subtitle}
                </Txt>
              </View>
              <PlaybackIcon
                size={21}
                color={current ? c.primary : c.textMuted}
              />
            </Pressable>
          );
        })}
      </ScrollView>
    </Dialog>
  );
}
