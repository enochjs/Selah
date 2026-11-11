import React from "react";
import { View, Pressable, Image, useWindowDimensions } from "react-native";
import { Check, ChevronRight, Heart, Music2 } from "lucide-react-native";
import type {
  CloudPlaylist,
  MusicPlaylistSelection,
} from "../../domain/music-library";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";

export function PlaylistBrowser({
  cloudPlaylists,
  selection,
  onSelect,
  compact = false,
}: {
  cloudPlaylists: CloudPlaylist[];
  selection: MusicPlaylistSelection | null;
  onSelect: (selection: MusicPlaylistSelection) => void;
  compact?: boolean;
}) {
  const { bi, locale } = useI18n();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const playlists = useAppStore((s) => s.musicPlaylists);
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.4 || width < 350 ? 1 : width >= 760 ? 3 : 2;
  function row(
    title: string,
    count: number,
    target: MusicPlaylistSelection,
    cover?: CloudPlaylist["cover"],
  ) {
    const selected =
      selection?.kind === target.kind &&
      (target.kind === "favorites" ||
        (selection.kind !== "favorites" && selection.id === target.id));
    const Icon = target.kind === "favorites" ? Heart : Music2;
    return (
      <Pressable
        key={
          target.kind === "favorites"
            ? "favorites"
            : `${target.kind}:${target.id}`
        }
        accessibilityRole="button"
        accessibilityState={{ selected }}
        accessibilityLabel={
          target.kind === "favorites"
            ? bi("打开我的收藏", "Open my favorites")
            : bi(`打开歌单 ${title}`, `Open playlist ${title}`)
        }
        onPress={() => onSelect(target)}
        style={({ pressed }) => ({
          minHeight: 76,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "center",
          gap: 14,
          borderBottomWidth: 1,
          borderColor: c.border,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        {cover ? (
          <Image
            source={images[cover]}
            style={{ width: 48, height: 48, borderRadius: 10 }}
          />
        ) : (
          <View
            style={{
              width: 48,
              height: 48,
              borderRadius: 10,
              backgroundColor: c.lightGreen,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon size={22} color={c.green} strokeWidth={1.6} />
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Txt
            numberOfLines={2}
            style={{ fontFamily: fonts.medium, fontSize: 16 }}
          >
            {title}
          </Txt>
          <Txt style={{ color: c.muted, fontSize: 12 }}>
            {bi(`${count} 首歌曲`, `${count} songs`)}
          </Txt>
        </View>
        {selected ? (
          <Check size={20} color={c.green} />
        ) : (
          <ChevronRight size={18} color={c.muted} />
        )}
      </Pressable>
    );
  }
  return (
    <View style={{ gap: 24 }}>
      <View>
        {row(bi("我的收藏", "My favorites"), favorites.length, {
          kind: "favorites",
        })}
        {playlists.map((p) =>
          row(p.name, p.hymns.length, { kind: "personal", id: p.id }),
        )}
      </View>
      <View style={{ gap: 14 }}>
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.medium, fontSize: 16 }}
        >
          {bi("平台歌单", "Community playlists")}
        </Txt>
        {!cloudPlaylists.length && (
          <Txt style={{ color: c.muted, lineHeight: 22 }}>
            {bi(
              "暂时没有可用的平台歌单，可以先从全部歌曲开始聆听。",
              "No community playlists yet. Explore all songs to start listening.",
            )}
          </Txt>
        )}
        {compact ? (
          <View>
            {cloudPlaylists.map((p) =>
              row(
                locale === "zh" ? p.titleZh : p.titleEn,
                p.hymnIds.length,
                { kind: "cloud", id: p.id },
                p.cover,
              ),
            )}
          </View>
        ) : (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            {cloudPlaylists.map((p) => {
              const title = locale === "zh" ? p.titleZh : p.titleEn;
              return (
                <Pressable
                  key={p.id}
                  accessibilityRole="button"
                  accessibilityLabel={bi(
                    `打开歌单 ${title}`,
                    `Open playlist ${title}`,
                  )}
                  onPress={() => onSelect({ kind: "cloud", id: p.id })}
                  style={({ pressed }) => ({
                    width:
                      columns === 1 ? "100%" : columns === 2 ? "47%" : "31%",
                    flexGrow: 0,
                    gap: 10,
                    opacity: pressed ? 0.7 : 1,
                    paddingBottom: 8,
                  })}
                >
                  <Image
                    source={images[p.cover]}
                    style={{
                      width: "100%",
                      aspectRatio: 1.45,
                      borderRadius: 14,
                    }}
                  />
                  <View style={{ gap: 5 }}>
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily: fonts.medium,
                        fontSize: 16,
                        lineHeight: 23,
                      }}
                    >
                      {title}
                    </Txt>
                    <Txt style={{ color: c.muted, fontSize: 12 }}>
                      {bi(
                        `${p.hymnIds.length} 首歌曲`,
                        `${p.hymnIds.length} songs`,
                      )}
                    </Txt>
                    <Txt
                      numberOfLines={2}
                      style={{ color: c.muted, fontSize: 13, lineHeight: 21 }}
                    >
                      {locale === "zh" ? p.descriptionZh : p.descriptionEn}
                    </Txt>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}
