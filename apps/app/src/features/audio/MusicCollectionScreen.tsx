import React, { useMemo, useState } from "react";
import { ActivityIndicator, View, useWindowDimensions } from "react-native";
import {
  Pause,
  PencilLine,
  Play,
  Plus,
  Search,
  Trash2,
} from "lucide-react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { useTheme } from "../../shared/theme-context";
import { Button, IconButton, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";
import { HymnList } from "./HymnList";
import { NowPlayingButton } from "./NowPlayingButton";
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
  const { width, fontScale = 1 } = useWindowDimensions();
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
  const activeQueue =
    queue.length > 0 &&
    audio.queue.length === queue.length &&
    queue.every((item, index) => item.id === audio.queue[index].id);
  const pausing = activeQueue && audio.playing;
  const playbackLabel = activeQueue
    ? pausing
      ? bi("暂停歌单", "Pause playlist")
      : bi("继续播放歌单", "Resume playlist")
    : bi("播放全部", "Play all");
  const playbackIcon = pausing ? Pause : Play;
  const playback = () =>
    activeQueue ? audio.toggle() : audio.playQueue(queue);
  const scriptureControl = width < 900 && audio.track?.kind === "scripture";
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
        count={loading || unavailable ? undefined : songs.length}
        back
        action={
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            {scriptureControl && <NowPlayingButton scriptureOnly />}
            {kind === "catalog" ? (
              <IconButton
                icon={Search}
                targetWidth={48}
                label={bi("搜索诗歌", "Search songs")}
                onPress={openSearch}
              />
            ) : editing ? (
              <Button small secondary onPress={() => setEditing(false)}>
                {bi("完成", "Done")}
              </Button>
            ) : (
              queue.length > 0 &&
              (width < 350 || fontScale > 1.25 || scriptureControl ? (
                <IconButton
                  icon={playbackIcon}
                  targetWidth={48}
                  active
                  activeStyle="surface"
                  visualSize={36}
                  label={playbackLabel}
                  onPress={playback}
                />
              ) : (
                <Button
                  small
                  icon={playbackIcon}
                  label={playbackLabel}
                  style={{ minWidth: 96, borderRadius: 24 }}
                  onPress={playback}
                >
                  {activeQueue
                    ? pausing
                      ? bi("暂停", "Pause")
                      : bi("继续", "Resume")
                    : playbackLabel}
                </Button>
              ))
            )}
          </View>
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
          personal ||
          description ||
          !songs.length ||
          status === "offline" ||
          (kind === "cloud" && cloud.status === "offline") ? (
            <View style={{ gap: 12, paddingVertical: 8 }}>
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
              {personal && (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 8,
                  }}
                >
                  {editing ? (
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
                      <Button small secondary icon={Plus} onPress={openSearch}>
                        {bi("添加歌曲", "Add songs")}
                      </Button>
                      <Button small secondary onPress={() => setEditing(true)}>
                        {bi("编辑", "Edit")}
                      </Button>
                    </>
                  )}
                </View>
              )}
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
          ) : undefined
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
