import React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import type { CloudPlaylist } from "../../domain/music-library";
import { useI18n } from "../../shared/i18n";
import { Button, Txt } from "../../shared/ui";
import { fonts, images } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { curatedPlaylistCovers } from "./playlist-covers";

export function PlaylistBrowser({
  playlists,
  status,
  onSelect,
  onRetry,
}: {
  playlists: CloudPlaylist[];
  status: "ready" | "offline" | "loading";
  onSelect: (id: string) => void;
  onRetry: () => void;
}) {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const { width, fontScale = 1 } = useWindowDimensions();
  const columns = fontScale > 1.4 || width < 350 ? 1 : width >= 900 ? 3 : 2;
  const rows = Array.from(
    { length: Math.ceil(playlists.length / columns) },
    (_, index) => playlists.slice(index * columns, (index + 1) * columns),
  );
  return (
    <View style={{ gap: 16 }}>
      {status === "loading" && !playlists.length && (
        <ActivityIndicator color={c.primary} />
      )}
      {status === "offline" && (
        <View style={{ alignItems: "flex-start", gap: 8 }}>
          <Txt style={{ color: c.textMuted }}>
            {bi("暂时无法更新平台歌单。", "Selah playlists could not refresh.")}
          </Txt>
          <Button small secondary onPress={onRetry}>
            {bi("重试", "Retry")}
          </Button>
        </View>
      )}
      {status === "ready" && !playlists.length && (
        <Txt style={{ color: c.textMuted }}>
          {bi("暂无可用的平台歌单。", "No Selah playlists are available yet.")}
        </Txt>
      )}
      {rows.map((row) => (
        <View
          key={row[0].id}
          style={{ flexDirection: "row", alignItems: "flex-start", gap: 16 }}
        >
          {row.map((playlist) => {
            const title = locale === "zh" ? playlist.titleZh : playlist.titleEn;
            return (
              <Pressable
                key={playlist.id}
                accessibilityRole="button"
                accessibilityLabel={bi(
                  `打开歌单 ${title}`,
                  `Open playlist ${title}`,
                )}
                onPress={() => onSelect(playlist.id)}
                style={({ pressed }) => ({
                  flex: 1,
                  minWidth: 0,
                  gap: 6,
                  paddingBottom: 6,
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <View
                  style={{
                    width: "100%",
                    aspectRatio: 1.55,
                    borderRadius: 12,
                    overflow: "hidden",
                    backgroundColor: c.surfaceMuted,
                  }}
                >
                  <Image
                    source={
                      curatedPlaylistCovers.get(playlist.id) ??
                      images[playlist.cover]
                    }
                    resizeMode="cover"
                    style={{
                      position: "absolute",
                      width: "100%",
                      height: "100%",
                    }}
                  />
                </View>
                <Txt
                  style={{ fontFamily: fonts.medium, fontSize: 16 }}
                  numberOfLines={2}
                >
                  {title}
                </Txt>
                <Txt
                  style={{ color: c.textMuted, lineHeight: 20 }}
                  numberOfLines={2}
                >
                  {locale === "zh"
                    ? playlist.descriptionZh
                    : playlist.descriptionEn}
                </Txt>
              </Pressable>
            );
          })}
          {Array.from({ length: columns - row.length }, (_, index) => (
            <View key={index} style={{ flex: 1 }} />
          ))}
        </View>
      ))}
    </View>
  );
}
