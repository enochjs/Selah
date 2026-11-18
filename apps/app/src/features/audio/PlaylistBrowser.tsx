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
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
        {playlists.map((playlist) => {
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
                width: columns === 1 ? "100%" : columns === 2 ? "47%" : "31%",
                gap: 8,
                paddingBottom: 8,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Image
                source={images[playlist.cover]}
                style={{ width: "100%", aspectRatio: 1.45, borderRadius: 14 }}
              />
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
      </View>
    </View>
  );
}
