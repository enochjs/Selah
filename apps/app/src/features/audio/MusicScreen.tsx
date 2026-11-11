import React, { useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { Plus, ListMusic, MoreHorizontal, Music2 } from "lucide-react-native";
import { useHymnCatalog } from "./useHymns";
import { useCloudPlaylists } from "./useCloudPlaylists";
import { HymnList } from "./HymnList";
import { LegacySongsPanel } from "./LegacySongsPanel";
import {
  MusicLibraryDialogs,
  type MusicLibraryAction,
} from "./MusicLibraryDialogs";
import { PlaylistBrowser } from "./PlaylistBrowser";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { Txt, Button, Panel, IconButton } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import type {
  MusicPlaylistSelection,
  HymnReference,
} from "../../domain/music-library";

export function MusicScreen() {
  const { bi, locale } = useI18n();
  const { width } = useWindowDimensions();
  const hymnCatalog = useHymnCatalog(locale);
  const catalog = hymnCatalog.tracks;
  const cloud = useCloudPlaylists();
  const playlists = useAppStore((s) => s.musicPlaylists);
  const favorites = useAppStore((s) => s.favoriteHymns);
  const savedSelection = useAppStore((s) => s.currentMusicPlaylist);
  const [tab, setTab] = useState<"playlists" | "songs">("playlists");
  const [action, setAction] = useState<MusicLibraryAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const listRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const selection =
    savedSelection &&
    (savedSelection.kind !== "personal" ||
      playlists.some((p) => p.id === savedSelection.id))
      ? savedSelection
      : playlists.length
        ? { kind: "personal" as const, id: playlists[playlists.length - 1].id }
        : favorites.length
          ? { kind: "favorites" as const }
          : null;
  const personal =
    selection?.kind === "personal"
      ? playlists.find((p) => p.id === selection.id)
      : undefined;
  const selectedCloud =
    selection?.kind === "cloud"
      ? cloud.items.find((p) => p.id === selection.id)
      : undefined;
  const unavailable =
    tab === "playlists" && selection?.kind === "cloud" && !selectedCloud;
  const playlistTitle =
    selection?.kind === "favorites"
      ? bi("我的收藏", "My favorites")
      : (personal?.name ??
        (selectedCloud
          ? locale === "zh"
            ? selectedCloud.titleZh
            : selectedCloud.titleEn
          : bi("歌单暂不可用", "Playlist unavailable")));
  const playlistHymns: HymnReference[] =
    selection?.kind === "favorites"
      ? favorites
      : (personal?.hymns ??
        selectedCloud?.hymnIds.map((id) => ({
          id,
          title:
            catalog.find((t) => t.id === id)?.title ??
            bi("暂不可用的诗歌", "Unavailable hymn"),
        })) ??
        []);
  const hymns = tab === "songs" ? catalog : playlistHymns;
  function changeTab(next: "playlists" | "songs") {
    setTab(next);
    listRef.current?.scrollTo({ y: 0, animated: false });
  }
  function selectPlaylist(next: MusicPlaylistSelection) {
    useAppStore.getState().setCurrentMusicPlaylist(next);
    setAction(null);
    changeTab("playlists");
  }
  function browse() {
    setAction(null);
    changeTab("songs");
  }
  async function refresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([hymnCatalog.refresh(), cloud.refresh()]);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }
  const directory = tab === "playlists" && !selection;
  return (
    <>
      <View
        style={{ flex: 1, width: "100%", maxWidth: 960, alignSelf: "center" }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginHorizontal: width < 760 ? 20 : 32,
            borderBottomWidth: 1,
            borderColor: c.border,
          }}
        >
          <View
            accessibilityRole="tablist"
            style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 24 }}
          >
            {(
              [
                [
                  "playlists",
                  selection ? playlistTitle : bi("歌单", "Playlists"),
                  selection && !(selection.kind === "cloud" && !selectedCloud)
                    ? playlistHymns.length
                    : undefined,
                ],
                ["songs", bi("全部歌曲", "All songs"), catalog.length],
              ] as const
            ).map(([key, title, count]) => (
              <Pressable
                key={key}
                accessibilityRole="tab"
                accessibilityLabel={title}
                accessibilityHint={
                  count === undefined
                    ? undefined
                    : bi(`${count} 首歌曲`, `${count} songs`)
                }
                accessibilityState={{ selected: tab === key }}
                onPress={() => changeTab(key)}
                style={({ pressed }) => ({
                  minHeight: 56,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                  flexShrink: key === "playlists" ? 1 : 0,
                  minWidth: 0,
                  justifyContent: "center",
                  borderBottomWidth: 2,
                  borderBottomColor: tab === key ? c.green : "transparent",
                  opacity: pressed ? 0.65 : 1,
                })}
              >
                <Txt
                  numberOfLines={1}
                  style={{
                    fontSize: 17,
                    flexShrink: 1,
                    fontFamily: tab === key ? fonts.medium : fonts.regular,
                    color: tab === key ? c.green : c.muted,
                  }}
                >
                  {title}
                </Txt>
                {count !== undefined && (
                  <Txt
                    accessible={false}
                    style={{
                      fontSize: 12,
                      color: c.muted,
                      fontFamily: fonts.regular,
                      flexShrink: 0,
                    }}
                  >
                    {count}
                  </Txt>
                )}
              </Pressable>
            ))}
          </View>
          {tab === "playlists" && !directory && (
            <>
              <IconButton
                icon={ListMusic}
                size={21}
                targetWidth={48}
                label={bi("切换歌单", "Switch playlist")}
                onPress={() => setAction({ kind: "choose" })}
              />
              {personal && (
                <IconButton
                  icon={MoreHorizontal}
                  targetWidth={48}
                  label={bi("歌单更多操作", "Playlist options")}
                  onPress={() =>
                    setAction({ kind: "manage", playlist: personal })
                  }
                />
              )}
            </>
          )}
        </View>
        <ScrollView
          ref={listRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            padding: width < 760 ? 20 : 32,
            gap: 24,
            paddingBottom: 32,
          }}
        >
          {(cloud.status === "offline" || hymnCatalog.status === "offline") && (
            <Panel style={{ padding: 16, gap: 12 }}>
              <Txt
                accessibilityRole="alert"
                style={{ color: c.muted, lineHeight: 22 }}
              >
                {cloud.status === "offline"
                  ? bi(
                      "云歌单暂时无法更新，请检查网络后重试。",
                      "Playlists could not be updated. Check your connection and retry.",
                    )
                  : bi(
                      "平台诗歌暂时无法更新，请检查网络后重试。",
                      "Songs could not be updated. Check your connection and retry.",
                    )}
              </Txt>
              <Button small secondary disabled={refreshing} onPress={refresh}>
                {refreshing
                  ? bi("正在重试…", "Retrying…")
                  : bi("重试", "Retry")}
              </Button>
            </Panel>
          )}
          <View style={{ gap: 16 }}>
            {directory ? (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <View style={{ flex: 1, minWidth: 140, gap: 4 }}>
                  <Txt
                    accessibilityRole="header"
                    style={{
                      fontSize: 22,
                      lineHeight: 30,
                      fontFamily: fonts.medium,
                    }}
                  >
                    {bi("全部歌单", "Explore playlists")}
                  </Txt>
                  <Txt style={{ color: c.muted, fontSize: 13, lineHeight: 21 }}>
                    {bi(
                      "选一张歌单，开始今天的聆听",
                      "Choose a playlist for this moment",
                    )}
                  </Txt>
                </View>
                <Button
                  small
                  secondary
                  icon={Plus}
                  onPress={() => setAction({ kind: "edit", name: "" })}
                >
                  {bi("新建歌单", "New playlist")}
                </Button>
              </View>
            ) : null}
            {directory ? (
              <>
                {cloud.status === "loading" && (
                  <ActivityIndicator color={c.green} />
                )}
                <PlaylistBrowser
                  cloudPlaylists={cloud.items}
                  selection={null}
                  onSelect={selectPlaylist}
                />
              </>
            ) : unavailable ? (
              <Panel style={{ padding: 24, gap: 12 }}>
                {cloud.status === "loading" && (
                  <ActivityIndicator color={c.green} />
                )}
                <Txt style={{ color: c.muted, lineHeight: 23 }}>
                  {cloud.status === "loading"
                    ? bi("正在加载歌单…", "Loading playlist…")
                    : bi(
                        "这张歌单暂时无法打开，试试切换其他歌单。",
                        "This playlist is unavailable. Try another playlist.",
                      )}
                </Txt>
              </Panel>
            ) : (
              <>
                {selectedCloud && tab === "playlists" && (
                  <Txt style={{ fontSize: 13, lineHeight: 22, color: c.muted }}>
                    {locale === "zh"
                      ? selectedCloud.descriptionZh
                      : selectedCloud.descriptionEn}
                  </Txt>
                )}
                {hymns.length ? (
                  <HymnList
                    compact
                    showPlayButton
                    hideFavorite={
                      tab === "playlists" && selection?.kind === "favorites"
                    }
                    hymns={hymns}
                    catalog={catalog}
                    playlistId={tab === "playlists" ? personal?.id : undefined}
                    onAdd={(hymn) => setAction({ kind: "add", hymn })}
                    onMore={(hymn) =>
                      setAction({
                        kind: "song",
                        hymn,
                        favorites:
                          tab === "playlists" &&
                          selection?.kind === "favorites",
                        playlistId:
                          tab === "playlists" ? personal?.id : undefined,
                      })
                    }
                  />
                ) : (
                  <View
                    style={{
                      paddingVertical: 40,
                      alignItems: "center",
                      gap: 16,
                    }}
                  >
                    {hymnCatalog.status === "loading" ? (
                      <ActivityIndicator color={c.green} />
                    ) : (
                      <View
                        style={{
                          width: 64,
                          height: 64,
                          borderRadius: 20,
                          backgroundColor: c.lightGreen,
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Music2 size={28} color={c.green} strokeWidth={1.5} />
                      </View>
                    )}
                    <Txt
                      style={{
                        color: c.muted,
                        fontSize: 15,
                        textAlign: "center",
                        lineHeight: 24,
                      }}
                    >
                      {hymnCatalog.status === "loading"
                        ? bi("正在加载诗歌…", "Loading songs…")
                        : tab === "songs"
                          ? bi(
                              "暂无可用的平台诗歌",
                              "No platform hymns available",
                            )
                          : bi("还没有歌曲", "No songs yet")}
                    </Txt>
                    {tab === "playlists" && (
                      <Button small secondary icon={Plus} onPress={browse}>
                        {bi("添加歌曲", "Add songs")}
                      </Button>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
          <LegacySongsPanel />
        </ScrollView>
      </View>
      <MusicLibraryDialogs
        action={action}
        setAction={setAction}
        catalog={catalog}
        cloudPlaylists={cloud.items}
        onBrowse={browse}
        onSelect={selectPlaylist}
        selection={selection}
      />
    </>
  );
}
