import React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { ArrowRight, Heart, Music2, Plus } from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { IconButton, Txt } from "../../shared/ui";
import type { MusicLibraryAction } from "./MusicLibraryDialogs";

export function MusicLibraryShortcuts({
  compact,
  onAction,
}: {
  compact: boolean;
  onAction: (action: MusicLibraryAction) => void;
}) {
  const { bi } = useI18n();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const playlists = useAppStore((s) => s.musicPlaylists);
  return (
    <View
      style={{
        gap: 12,
        padding: compact ? 0 : 20,
        backgroundColor: compact ? "transparent" : c.sidebar,
        borderRadius: 16,
      }}
    >
      {!compact && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Txt
            accessibilityRole="header"
            style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16 }}
          >
            {bi("我的音乐", "My music")}
          </Txt>
          <IconButton
            icon={Plus}
            label={bi("新建歌单", "New playlist")}
            onPress={() => onAction({ kind: "edit", name: "" })}
          />
        </View>
      )}
      <ScrollView
        horizontal={compact}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bi("打开我的收藏", "Open my favorites")}
          onPress={() =>
            onAction({ kind: "details", selection: { kind: "favorites" } })
          }
          style={({ pressed }) => ({
            minHeight: 64,
            minWidth: compact ? 164 : undefined,
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            borderRadius: 12,
            padding: 12,
            backgroundColor: c.lightGreen,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Heart size={22} color={c.green} strokeWidth={1.6} />
          <View style={{ flex: 1, gap: 4 }}>
            <Txt style={{ fontFamily: fonts.medium }}>
              {bi("我的收藏", "My favorites")}
            </Txt>
            <Txt style={{ fontSize: typeScale.caption, color: c.muted }}>
              {bi(`${favorites.length} 首诗歌`, `${favorites.length} songs`)}
            </Txt>
          </View>
          {!compact && <ArrowRight size={16} color={c.green} />}
        </Pressable>
        {playlists.map((playlist) => (
          <Pressable
            key={playlist.id}
            accessibilityRole="button"
            accessibilityLabel={bi(
              `打开歌单 ${playlist.name}`,
              `Open playlist ${playlist.name}`,
            )}
            onPress={() =>
              onAction({
                kind: "details",
                selection: { kind: "personal", id: playlist.id },
              })
            }
            style={({ pressed }) => ({
              minHeight: 64,
              width: compact ? 172 : undefined,
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              padding: 12,
              backgroundColor: c.paper,
              borderRadius: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Music2 size={22} color={c.green} strokeWidth={1.6} />
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
              <Txt numberOfLines={2} style={{ fontFamily: fonts.medium }}>
                {playlist.name}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: typeScale.caption }}>
                {bi(
                  `${playlist.hymns.length} 首诗歌`,
                  `${playlist.hymns.length} songs`,
                )}
              </Txt>
            </View>
          </Pressable>
        ))}
        {compact && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi("新建歌单", "New playlist")}
            onPress={() => onAction({ kind: "edit", name: "" })}
            style={({ pressed }) => ({
              minHeight: 64,
              minWidth: 140,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: c.border,
              borderRadius: 12,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Plus size={20} color={c.green} strokeWidth={1.6} />
            <Txt style={{ color: c.green, fontFamily: fonts.medium }}>
              {bi("新建歌单", "New playlist")}
            </Txt>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}
