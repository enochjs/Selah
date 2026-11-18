import React, { useMemo, useState } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import { PencilLine, Play, Plus, Trash2 } from "lucide-react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { useTheme } from "../../shared/theme-context";
import { Button, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";
import { HymnList } from "./HymnList";
import { useCloudPlaylists } from "./useCloudPlaylists";
import { useHymnCatalog } from "./useHymns";
import {
  libraryGutter,
  MusicLibraryHeader,
  MusicLibraryView,
} from "./MusicLibraryView";
import {
  MusicLibraryDialogs,
  type MusicLibraryAction,
} from "./MusicLibraryDialogs";

export function MusicCollectionScreen({
  kind,
  id,
}: {
  kind?: string;
  id?: string;
}) {
  const { width } = useWindowDimensions();
  const { bi, locale } = useI18n();
  const { colors: c } = useTheme();
  const { tracks, status, refresh } = useHymnCatalog(locale);
  const cloud = useCloudPlaylists();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const recent = useAppStore((s) => s.recentHymns);
  const personal = useAppStore((s) =>
    kind === "personal"
      ? s.musicPlaylists.find((item) => item.id === id)
      : undefined,
  );
  const platform =
    kind === "cloud" ? cloud.items.find((item) => item.id === id) : undefined;
  const audio = useAudio();
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState<MusicLibraryAction | null>(null);
  const byId = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const songs =
    kind === "favorites"
      ? favorites
      : kind === "recent"
        ? recent
        : personal
          ? personal.hymns
          : platform
            ? platform.hymnIds.map((songId) => ({
                id: songId,
                title:
                  byId.get(songId)?.title ??
                  bi("暂不可用的诗歌", "Unavailable hymn"),
              }))
            : kind === "catalog"
              ? tracks
              : [];
  const queue = songs.flatMap(({ id: songId }) => byId.get(songId) ?? []);
  const title =
    personal?.name ??
    (platform
      ? locale === "zh"
        ? platform.titleZh
        : platform.titleEn
      : kind === "favorites"
        ? bi("我的收藏", "Favorites")
        : kind === "recent"
          ? bi("最近播放", "Recently played")
          : kind === "catalog"
            ? bi("全部歌曲", "All songs")
            : bi("歌单", "Playlist"));
  const loading =
    (kind === "cloud" && cloud.status === "loading" && !platform) ||
    (status === "loading" && !songs.length);
  const unavailable =
    (kind === "personal" && !personal) ||
    (kind === "cloud" && !platform && cloud.status !== "loading");
  const description = platform
    ? locale === "zh"
      ? platform.descriptionZh
      : platform.descriptionEn
    : "";
  const empty = unavailable
    ? bi("这张歌单暂时无法打开。", "This playlist is unavailable.")
    : kind === "recent"
      ? bi("听过的歌会出现在这里。", "Songs you listen to will appear here.")
      : kind === "favorites"
        ? bi(
            "收藏喜欢的歌，下次就能在这里找到。",
            "Save your favorite songs to find them here.",
          )
        : kind === "catalog"
          ? bi("暂无可用的平台诗歌。", "No published songs are available.")
          : bi("还没有歌曲。", "No songs yet.");
  const openSearch = () =>
    router.push(
      personal
        ? { pathname: "/music/search", params: { playlistId: personal.id } }
        : "/music/search",
    );

  return (
    <MusicLibraryView>
      <MusicLibraryHeader
        title={title}
        back
        action={
          personal ? (
            <Button
              small
              secondary
              onPress={() => setEditing((value) => !value)}
            >
              {editing ? bi("完成", "Done") : bi("编辑", "Edit")}
            </Button>
          ) : undefined
        }
      />
      <HymnList
        virtualized
        compact
        showPlayButton
        hideFavorite
        catalog={tracks}
        hymns={songs}
        onAdd={(hymn) => setAction({ kind: "add", hymn })}
        onMore={(hymn) =>
          setAction({
            kind: "song",
            hymn,
            playlistId: editing ? personal?.id : undefined,
            favorites: kind === "favorites",
          })
        }
        contentContainerStyle={{
          paddingHorizontal: libraryGutter(width),
          paddingBottom: 24,
        }}
        ListHeaderComponent={
          <View style={{ gap: 12, paddingBottom: 12 }}>
            {!!description && (
              <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
                {description}
              </Txt>
            )}
            {(status === "offline" ||
              (kind === "cloud" && cloud.status === "offline")) && (
              <View style={{ alignItems: "flex-start", gap: 8 }}>
                <Txt style={{ color: c.textMuted }}>
                  {bi("歌库暂时无法更新。", "The library could not refresh.")}
                </Txt>
                <Button
                  small
                  secondary
                  onPress={() =>
                    void (kind === "cloud"
                      ? Promise.all([refresh(), cloud.refresh()])
                      : refresh())
                  }
                >
                  {bi("重试", "Retry")}
                </Button>
              </View>
            )}
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 8,
              }}
            >
              {editing && personal ? (
                <>
                  <Button
                    small
                    secondary
                    icon={PencilLine}
                    onPress={() =>
                      setAction({
                        kind: "edit",
                        id: personal.id,
                        name: personal.name,
                      })
                    }
                  >
                    {bi("重命名", "Rename")}
                  </Button>
                  <Button
                    small
                    secondary
                    icon={Trash2}
                    onPress={() =>
                      setAction({ kind: "delete", playlist: personal })
                    }
                  >
                    {bi("删除歌单", "Delete playlist")}
                  </Button>
                </>
              ) : (
                <>
                  {!!queue.length && kind !== "catalog" && (
                    <Button
                      small
                      icon={Play}
                      onPress={() => audio.playQueue(queue)}
                    >
                      {bi("播放全部", "Play all")}
                    </Button>
                  )}
                  {(personal || kind === "catalog") && (
                    <Button
                      small
                      secondary
                      icon={personal ? Plus : undefined}
                      onPress={openSearch}
                    >
                      {personal
                        ? bi("添加歌曲", "Add songs")
                        : bi("搜索诗歌", "Search songs")}
                    </Button>
                  )}
                </>
              )}
              {!!songs.length && (
                <Txt style={{ color: c.textMuted, fontSize: 13 }}>
                  {bi(`${songs.length} 首`, `${songs.length} songs`)}
                </Txt>
              )}
            </View>
            {editing && songs.length > 0 && (
              <Txt style={{ color: c.textMuted, fontSize: 13 }}>
                {bi(
                  "点歌曲右侧的菜单，调整顺序或移除。",
                  "Open a song’s menu to move or remove it.",
                )}
              </Txt>
            )}
            {!songs.length &&
              (loading ? (
                <ActivityIndicator color={c.primary} />
              ) : (
                <View
                  style={{
                    alignItems: "flex-start",
                    gap: 8,
                    paddingVertical: 12,
                  }}
                >
                  <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
                    {empty}
                  </Txt>
                  {(kind === "favorites" || kind === "recent") && (
                    <Button small secondary onPress={openSearch}>
                      {bi("搜索诗歌", "Search songs")}
                    </Button>
                  )}
                </View>
              ))}
          </View>
        }
      />
      <MusicLibraryDialogs
        action={action}
        setAction={setAction}
        catalog={tracks}
        onDeleted={() => {
          if (router.canGoBack()) router.back();
          else router.replace("/music");
        }}
      />
    </MusicLibraryView>
  );
}
