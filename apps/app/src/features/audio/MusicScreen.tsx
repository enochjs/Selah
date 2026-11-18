import React, { useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import {
  Clock,
  Download,
  Heart,
  ListMusic,
  Music2,
  Plus,
  Search,
} from "lucide-react-native";
import { router } from "expo-router";
import { useHymnCatalog } from "./useHymns";
import { useCloudPlaylists } from "./useCloudPlaylists";
import { LegacySongsPanel } from "./LegacySongsPanel";
import {
  MusicLibraryDialogs,
  type MusicLibraryAction,
} from "./MusicLibraryDialogs";
import {
  libraryGutter,
  MusicLibraryHeader,
  MusicLibraryRow,
  MusicLibraryView,
  MusicSection,
} from "./MusicLibraryView";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { Button, Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme-context";

export function MusicScreen() {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const { width, fontScale = 1 } = useWindowDimensions();
  const hymns = useHymnCatalog(locale);
  const cloud = useCloudPlaylists();
  const playlists = useAppStore((s) => s.musicPlaylists);
  const favorites = useAppStore((s) => s.favoriteHymns);
  const recent = useAppStore((s) => s.recentHymns);
  const [action, setAction] = useState<MusicLibraryAction | null>(null);
  const [retrying, setRetrying] = useState(false);
  const openCollection = (
    kind: "favorites" | "recent" | "personal" | "catalog",
    id?: string,
  ) =>
    router.push({
      pathname: "/music/collection",
      params: { kind, ...(id ? { id } : {}) },
    });
  const shortcuts = [
    {
      icon: Heart,
      title: bi("我的收藏", "Favorites"),
      detail: favorites.length,
      open: () => openCollection("favorites"),
    },
    {
      icon: Clock,
      title: bi("最近播放", "Recently played"),
      detail: recent.length,
      open: () => openCollection("recent"),
    },
    {
      icon: Download,
      title: bi("已下载", "Downloaded"),
      detail: "",
      open: () => router.push("/music/downloads"),
    },
  ];
  return (
    <MusicLibraryView>
      <MusicLibraryHeader
        title={bi("聆听", "Listen")}
        action={
          <Button
            small
            secondary
            icon={Plus}
            onPress={() => setAction({ kind: "edit", name: "" })}
          >
            {bi("新建歌单", "New playlist")}
          </Button>
        }
      />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: libraryGutter(width),
          paddingBottom: 28,
          gap: 28,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={bi("搜索诗歌", "Search songs")}
          onPress={() => router.push("/music/search")}
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
            minHeight: 54,
            padding: 12,
            borderRadius: 14,
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            opacity: pressed ? 0.65 : 1,
          })}
        >
          <Search aria-hidden size={20} color={c.primaryStrong} />
          <Txt
            style={{
              flex: 1,
              color: c.textMuted,
              fontSize: 15,
              lineHeight: 22,
            }}
          >
            {bi(
              "搜歌名、演唱者或一句歌词",
              "Search by title, artist or a line of lyrics",
            )}
          </Txt>
        </Pressable>
        <View
          style={{
            flexDirection: width < 350 || fontScale > 1.3 ? "column" : "row",
            gap: 8,
          }}
        >
          {shortcuts.map(({ icon: Icon, title, detail, open }) => (
            <Pressable
              key={title}
              accessibilityRole="button"
              accessibilityLabel={title}
              onPress={open}
              style={({ pressed }) => ({
                flex: 1,
                minWidth: 0,
                minHeight: 72,
                borderRadius: 12,
                padding: 10,
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                backgroundColor: c.primarySoft,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Icon
                aria-hidden
                size={19}
                color={c.primaryStrong}
                strokeWidth={1.65}
              />
              <Txt
                style={{
                  color: c.primaryStrong,
                  fontSize: 13,
                  textAlign: "center",
                }}
              >
                {title}
                {detail ? `  ${detail}` : ""}
              </Txt>
            </Pressable>
          ))}
        </View>
        <MusicSection title={bi("我的歌单", "My playlists")}>
          {playlists.length ? (
            playlists.map((playlist) => (
              <MusicLibraryRow
                key={playlist.id}
                icon={ListMusic}
                title={playlist.name}
                label={bi(
                  `打开歌单 ${playlist.name}`,
                  `Open playlist ${playlist.name}`,
                )}
                detail={bi(
                  `${playlist.hymns.length} 首`,
                  `${playlist.hymns.length} songs`,
                )}
                onPress={() => openCollection("personal", playlist.id)}
              />
            ))
          ) : (
            <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
              {bi(
                "还没有歌单。找到喜欢的歌后，可以把它们放在一起。",
                "Create a playlist to keep the songs you like together.",
              )}
            </Txt>
          )}
        </MusicSection>
        <MusicSection title={bi("浏览歌库", "Browse library")}>
          <MusicLibraryRow
            icon={Music2}
            title={bi("全部歌曲", "All songs")}
            detail={
              hymns.tracks.length
                ? bi(
                    `${hymns.tracks.length} 首`,
                    `${hymns.tracks.length} songs`,
                  )
                : undefined
            }
            onPress={() => openCollection("catalog")}
          />
          <MusicLibraryRow
            icon={ListMusic}
            title={bi("平台歌单", "Selah playlists")}
            onPress={() => router.push("/music/playlists")}
          />
          {(hymns.status === "offline" || cloud.status === "offline") && (
            <View style={{ alignItems: "flex-start", gap: 4 }}>
              <Txt style={{ color: c.textMuted }}>
                {bi(
                  "歌库暂时无法更新，仍可浏览已缓存的内容。",
                  "The library could not refresh. Cached songs are still available.",
                )}
              </Txt>
              <Button
                small
                secondary
                disabled={retrying}
                onPress={async () => {
                  setRetrying(true);
                  try {
                    await Promise.all([hymns.refresh(), cloud.refresh()]);
                  } finally {
                    setRetrying(false);
                  }
                }}
              >
                {retrying ? bi("正在重试…", "Retrying…") : bi("重试", "Retry")}
              </Button>
            </View>
          )}
        </MusicSection>
        <LegacySongsPanel />
      </ScrollView>
      <MusicLibraryDialogs
        action={action}
        setAction={setAction}
        catalog={hymns.tracks}
        onSaved={(id) => openCollection("personal", id)}
      />
    </MusicLibraryView>
  );
}
