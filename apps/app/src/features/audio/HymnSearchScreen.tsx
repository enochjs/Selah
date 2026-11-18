import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Check,
  MoreHorizontal,
  Pause,
  Play,
  Search,
  X,
} from "lucide-react-native";
import { router } from "expo-router";
import { indexHymns, searchHymns } from "../../domain/hymn-search";
import type { HymnReference } from "../../domain/music-library";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, IconButton, Txt, inputStyle } from "../../shared/ui";
import { useAudio } from "./AudioProvider";
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

export function HymnSearchScreen({ playlistId }: { playlistId?: string }) {
  const { colors: c } = useTheme();
  const { bi, locale } = useI18n();
  const { width } = useWindowDimensions();
  const gutter = libraryGutter(width);
  const { tracks, status, refresh } = useHymnCatalog(locale);
  const audio = useAudio();
  const playlist = useAppStore((s) =>
    s.musicPlaylists.find((item) => item.id === playlistId),
  );
  const favorites = useAppStore((s) => s.favoriteHymns);
  const recent = useAppStore((s) => s.recentHymns);
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [selected, setSelected] = useState<HymnReference[]>([]);
  const [action, setAction] = useState<MusicLibraryAction | null>(null);
  const index = useMemo(() => indexHymns(tracks), [tracks]);
  const matches = useMemo(
    () => searchHymns(tracks, query, index),
    [tracks, query, index],
  );
  const favoriteIds = useMemo(
    () => new Set(favorites.map(({ id }) => id)),
    [favorites],
  );
  const recentIds = useMemo(
    () => new Set(recent.map(({ id }) => id)),
    [recent],
  );
  const selectedIds = new Set(selected.map(({ id }) => id));
  const addedIds = new Set(playlist?.hymns.map(({ id }) => id));
  const tracksById = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks],
  );
  const recentResults = recent.slice(0, 6).flatMap(({ id }) => {
    const track = tracksById.get(id);
    return track ? [{ track }] : [];
  });
  const results = query.trim()
    ? matches
    : playlist
      ? tracks.map((track) => ({ track }))
      : recentResults;
  const loading = !tracks.length && status === "loading";
  const title = playlist
    ? bi("添加歌曲", "Add songs")
    : bi("搜索诗歌", "Search songs");
  const availableSelection = selected.filter(
    ({ id }) => tracksById.has(id) && !addedIds.has(id),
  );

  function addSelected() {
    if (!playlist) return;
    const store = useAppStore.getState();
    const added = store.addPlaylistHymns(playlist.id, availableSelection);
    if (!added.length) return;
    store.notify(
      bi(`已添加 ${added.length} 首`, `Added ${added.length} songs`),
    );
    if (router.canGoBack()) router.back();
    else
      router.replace({
        pathname: "/music/collection",
        params: { kind: "personal", id: playlist.id },
      });
  }

  return (
    <MusicLibraryView>
      <MusicLibraryHeader title={title} back />
      <View style={{ paddingHorizontal: gutter, gap: 8, paddingBottom: 8 }}>
        {playlist && <Txt style={{ color: c.textMuted }}>{playlist.name}</Txt>}
        {playlistId && !playlist ? (
          <Txt style={{ color: c.textMuted }}>
            {bi("这张歌单已不可用。", "This playlist is unavailable.")}
          </Txt>
        ) : (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              paddingHorizontal: 12,
              gap: 8,
              backgroundColor: c.surface,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: focused ? c.primaryStrong : c.border,
            }}
          >
            <Search aria-hidden size={19} color={c.textMuted} />
            <TextInput
              value={query}
              autoFocus={!playlist}
              accessibilityLabel={bi(
                "搜歌名、演唱者或一句歌词",
                "Search by title, artist or lyrics",
              )}
              placeholder={bi(
                "歌名、演唱者或一句歌词",
                "Title, artist or a line of lyrics",
              )}
              placeholderTextColor={c.textMuted}
              onChangeText={setQuery}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              returnKeyType="search"
              maxLength={160}
              autoCorrect={false}
              style={[
                inputStyle(c),
                {
                  flex: 1,
                  minWidth: 0,
                  minHeight: 50,
                  borderWidth: 0,
                  outlineWidth: 0,
                  backgroundColor: "transparent",
                  paddingHorizontal: 0,
                },
              ]}
            />
            {!!query && (
              <IconButton
                icon={X}
                label={bi("清空搜索", "Clear search")}
                onPress={() => setQuery("")}
              />
            )}
          </View>
        )}
        {status === "offline" && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Txt style={{ color: c.textMuted, flex: 1 }}>
              {bi("当前在搜索已缓存的歌库。", "Searching the cached library.")}
            </Txt>
            <Button small secondary onPress={() => void refresh()}>
              {bi("重试", "Retry")}
            </Button>
          </View>
        )}
      </View>
      {(!playlistId || playlist) && (
        <FlatList<{ track: (typeof tracks)[number]; lyric?: string }>
          data={results}
          keyExtractor={({ track }) => track.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{
            paddingHorizontal: gutter,
            paddingBottom: 20,
          }}
          ListHeaderComponent={
            (!loading && query.trim()) ||
            (recentResults.length > 0 && !playlist) ? (
              <Txt
                accessibilityLiveRegion="polite"
                style={{ color: c.textMuted, paddingVertical: 8 }}
              >
                {query.trim()
                  ? bi(`找到 ${results.length} 首`, `${results.length} matches`)
                  : bi("最近播放", "Recently played")}
              </Txt>
            ) : undefined
          }
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={c.primary} style={{ padding: 20 }} />
            ) : (
              <Txt
                style={{
                  color: c.textMuted,
                  lineHeight: 23,
                  paddingVertical: 18,
                }}
              >
                {query.trim()
                  ? bi(
                      "没找到匹配的歌。试试歌词里几个连续的字，或换一个演唱者。",
                      "No matches. Try a shorter lyric phrase or a different performer.",
                    )
                  : playlist
                    ? bi("暂无可添加的歌曲。", "No songs are available to add.")
                    : bi(
                        "记得副歌里的几个字？可以直接输入。",
                        "Remember a few words from the chorus? Try typing them here.",
                      )}
              </Txt>
            )
          }
          renderItem={({ item: { track, lyric } }) => {
            const reference = { id: track.id, title: track.title };
            const current = track.id === audio.track?.id;
            const playing = current && audio.playing;
            const included = addedIds.has(track.id);
            const checked = included || selectedIds.has(track.id);
            const note = favoriteIds.has(track.id)
              ? bi("已收藏", "Favorite")
              : recentIds.has(track.id) && query.trim()
                ? bi("听过", "Played")
                : null;
            const artist = track.hymn?.artist;
            const [credit, ...version] = track.subtitle.split(" · ");
            const artistAndVersion =
              artist && !credit.includes(artist)
                ? [
                    artist,
                    ...(credit && artist.startsWith(credit)
                      ? version
                      : [track.subtitle]),
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : track.subtitle;
            return (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingVertical: 4,
                  borderBottomWidth: 1,
                  borderColor: c.border,
                  backgroundColor:
                    current && !playlist ? c.primarySoft : undefined,
                }}
              >
                <Pressable
                  accessibilityRole={playlist ? "checkbox" : "button"}
                  accessibilityState={
                    playlist ? { checked, disabled: included } : undefined
                  }
                  accessibilityLabel={
                    playlist
                      ? track.title
                      : bi(
                          `${playing ? "暂停" : "播放"} ${track.title}`,
                          `${playing ? "Pause" : "Play"} ${track.title}`,
                        )
                  }
                  disabled={!!playlist && included}
                  onPress={() => {
                    if (playlist) {
                      setSelected((items) =>
                        items.some(({ id }) => id === track.id)
                          ? items.filter(({ id }) => id !== track.id)
                          : [...items, reference],
                      );
                    } else if (current) audio.toggle();
                    else audio.playQueue([track]);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minWidth: 0,
                    minHeight: 58,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    paddingVertical: 6,
                    paddingLeft: 4,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  {playlist && (
                    <View
                      aria-hidden
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 6,
                        borderWidth: 1,
                        borderColor: checked ? c.primary : c.textMuted,
                        backgroundColor: checked ? c.primarySoft : undefined,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {checked && <Check size={16} color={c.primaryStrong} />}
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <Txt
                      numberOfLines={2}
                      style={{
                        fontFamily: fonts.medium,
                        fontSize: 16,
                        lineHeight: 23,
                      }}
                    >
                      {track.title}
                    </Txt>
                    {!!artistAndVersion && (
                      <Txt
                        numberOfLines={2}
                        style={{ color: c.textMuted, fontSize: 13 }}
                      >
                        {artistAndVersion}
                      </Txt>
                    )}
                    {!!note && !playlist && (
                      <Txt style={{ color: c.primaryStrong, fontSize: 12 }}>
                        {note}
                      </Txt>
                    )}
                    {!!lyric && (
                      <Txt
                        numberOfLines={2}
                        style={{ color: c.primaryStrong, fontSize: 13 }}
                      >
                        {bi("歌词", "Lyrics")} · {lyric}
                      </Txt>
                    )}
                  </View>
                  {!!playlist && included && (
                    <Txt style={{ color: c.textMuted, fontSize: 12 }}>
                      {bi("已添加", "Added")}
                    </Txt>
                  )}
                  {!playlist && (
                    <View
                      aria-hidden
                      style={{ width: 32, alignItems: "center" }}
                    >
                      {playing ? (
                        <Pause size={20} color={c.primaryStrong} />
                      ) : (
                        <Play size={20} color={c.primaryStrong} />
                      )}
                    </View>
                  )}
                </Pressable>
                {!playlist && (
                  <IconButton
                    icon={MoreHorizontal}
                    targetWidth={48}
                    label={bi(
                      `更多操作 ${track.title}`,
                      `More options for ${track.title}`,
                    )}
                    onPress={() => setAction({ kind: "song", hymn: reference })}
                  />
                )}
              </View>
            );
          }}
        />
      )}
      {playlist && (
        <View
          style={{
            paddingHorizontal: gutter,
            paddingVertical: 10,
            backgroundColor: c.surface,
            borderTopWidth: 1,
            borderColor: c.border,
          }}
        >
          <Button disabled={!availableSelection.length} onPress={addSelected}>
            {availableSelection.length
              ? bi(
                  `添加 ${availableSelection.length} 首`,
                  `Add ${availableSelection.length} songs`,
                )
              : bi("添加所选歌曲", "Add selected songs")}
          </Button>
        </View>
      )}
      <MusicLibraryDialogs
        action={action}
        setAction={setAction}
        catalog={tracks}
      />
    </MusicLibraryView>
  );
}
