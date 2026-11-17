import React, { useMemo } from "react";
import { FlatList, View, Pressable, type FlatListProps } from "react-native";
import {
  Play,
  Pause,
  Heart,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
} from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type { HymnReference } from "../../domain/music-library";
import { useAudio } from "./AudioProvider";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { IconButton, Txt } from "../../shared/ui";
import { formatTime } from "../../domain/playback";
import { colors as c, fonts } from "../../shared/theme";
import { HymnDownloadButton } from "../downloads/HymnDownloadButton";

export function HymnList({
  hymns,
  catalog,
  onAdd,
  playlistId,
  compact = false,
  onMore,
  showPlayButton = false,
  hideFavorite = false,
  virtualized = false,
  listRef,
  ...listProps
}: {
  hymns: HymnReference[];
  catalog: AudioTrack[];
  onAdd: (hymn: HymnReference) => void;
  playlistId?: string;
  compact?: boolean;
  onMore?: (hymn: HymnReference) => void;
  showPlayButton?: boolean;
  hideFavorite?: boolean;
  virtualized?: boolean;
  listRef?: React.Ref<FlatList<HymnReference>>;
} & Pick<
  FlatListProps<HymnReference>,
  "ListHeaderComponent" | "ListFooterComponent" | "contentContainerStyle"
>) {
  const audio = useAudio();
  const { bi } = useI18n();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const tracks = useMemo(
    () => new Map(catalog.map((track) => [track.id, track])),
    [catalog],
  );
  const queue = useMemo(
    () => hymns.flatMap((hymn) => tracks.get(hymn.id) ?? []),
    [hymns, tracks],
  );
  const favoriteIds = useMemo(
    () => new Set(favorites.map((hymn) => hymn.id)),
    [favorites],
  );
  const renderRow = (hymn: HymnReference, index: number) => {
    const track = tracks.get(hymn.id);
    const title = track?.title ?? hymn.title;
    const reference = { id: hymn.id, title };
    const saved = favoriteIds.has(hymn.id);
    const current = audio.track?.id === hymn.id;
    const play = () => {
      if (!track) return;
      if (current) audio.toggle();
      else
        audio.playQueue(
          queue,
          queue.findIndex((item) => item.id === track.id),
        );
    };
    const playButton = (
      <IconButton
        targetWidth={onMore ? 48 : compact ? 32 : 44}
        size={compact ? 18 : 19}
        icon={current && audio.playing ? Pause : Play}
        onPress={play}
        disabled={!track}
        active={current}
        activeStyle={compact ? "surface" : "icon"}
        visualSize={compact && current ? 32 : undefined}
        label={
          !track
            ? bi(`${title} 暂不可用`, `${title} is unavailable`)
            : current
              ? audio.playing
                ? bi(`暂停 ${title}`, `Pause ${title}`)
                : bi(`继续播放 ${title}`, `Resume ${title}`)
              : bi(`播放 ${title}`, `Play ${title}`)
        }
      />
    );
    return (
      <View
        key={hymn.id}
        style={{
          paddingVertical: compact ? 10 : 14,
          borderTopWidth: 1,
          borderColor:
            compact &&
            (current || (index > 0 && audio.track?.id === hymns[index - 1].id))
              ? "transparent"
              : c.border,
          gap: 6,
        }}
      >
        {compact && current && (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: 4,
              bottom: 4,
              left: -10,
              right: -10,
              borderRadius: 8,
              backgroundColor: c.lightGreen,
            }}
          >
            <View
              style={{
                position: "absolute",
                left: 0,
                top: 8,
                bottom: 8,
                width: 4,
                borderRadius: 2,
                backgroundColor: c.green,
              }}
            />
          </View>
        )}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: compact ? 0 : 8,
          }}
        >
          {!compact && playButton}
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: current, disabled: !track }}
            accessibilityLabel={
              onMore
                ? !track
                  ? bi(`${title} 暂不可用`, `${title} is unavailable`)
                  : current
                    ? audio.playing
                      ? bi(`暂停 ${title}`, `Pause ${title}`)
                      : bi(`继续播放 ${title}`, `Resume ${title}`)
                    : bi(`播放 ${title}`, `Play ${title}`)
                : undefined
            }
            disabled={!track}
            onPress={play}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: onMore ? 56 : 44,
              justifyContent: "center",
              gap: 5,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Txt
              numberOfLines={compact ? 1 : 2}
              style={{
                fontFamily: fonts.medium,
                fontSize: 16,
                lineHeight: 24,
                color: current ? c.darkGreen : c.ink,
              }}
            >
              {title}
            </Txt>
            {compact && (
              <Txt
                numberOfLines={1}
                style={{ color: c.muted, fontSize: 12, lineHeight: 20 }}
              >
                {[
                  track?.duration &&
                  Number.isFinite(track.duration) &&
                  track.duration > 0
                    ? formatTime(track.duration)
                    : null,
                  track?.subtitle ??
                    bi(
                      "暂不可用 · 收藏记录已保留",
                      "Unavailable · Saved reference kept",
                    ),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Txt>
            )}
          </Pressable>
          {compact && (!onMore || showPlayButton) && playButton}
          {!hideFavorite && (
            <IconButton
              targetWidth={compact && !onMore ? 32 : 48}
              size={compact ? 18 : 19}
              icon={Heart}
              active={saved}
              activeStyle="icon"
              fillActive
              onPress={() =>
                useAppStore.getState().toggleFavoriteHymn(reference)
              }
              label={
                saved
                  ? bi(`取消收藏 ${title}`, `Unfavorite ${title}`)
                  : bi(`收藏 ${title}`, `Favorite ${title}`)
              }
            />
          )}
          {onMore && (
            <IconButton
              targetWidth={48}
              icon={MoreHorizontal}
              label={bi(`更多操作 ${title}`, `More options for ${title}`)}
              onPress={() => onMore(reference)}
            />
          )}
          {compact && !onMore && (
            <>
              <IconButton
                targetWidth={32}
                size={18}
                icon={Plus}
                disabled={!track}
                onPress={() => onAdd(reference)}
                label={bi(`添加 ${title} 到歌单`, `Add ${title} to playlist`)}
              />
              {track && (
                <HymnDownloadButton
                  key={track.id}
                  track={track}
                  targetWidth={32}
                />
              )}
            </>
          )}
        </View>
        {!compact && (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              paddingLeft: 52,
              gap: 8,
            }}
          >
            <Txt
              numberOfLines={2}
              style={{
                flex: 1,
                color: c.muted,
                fontSize: 13,
                lineHeight: 21,
              }}
            >
              {track?.subtitle ??
                bi(
                  "暂不可用 · 收藏记录已保留",
                  "Unavailable · Saved reference kept",
                )}
            </Txt>
            <IconButton
              icon={Plus}
              disabled={!track}
              onPress={() => onAdd(reference)}
              label={bi(`添加 ${title} 到歌单`, `Add ${title} to playlist`)}
            />
            {track && <HymnDownloadButton key={track.id} track={track} />}
          </View>
        )}
        {playlistId && !onMore && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: 2,
            }}
          >
            <IconButton
              icon={ArrowUp}
              disabled={index === 0}
              label={bi(`上移 ${title}`, `Move ${title} up`)}
              onPress={() =>
                useAppStore.getState().movePlaylistHymn(playlistId, hymn.id, -1)
              }
            />
            <IconButton
              icon={ArrowDown}
              disabled={index === hymns.length - 1}
              label={bi(`下移 ${title}`, `Move ${title} down`)}
              onPress={() =>
                useAppStore.getState().movePlaylistHymn(playlistId, hymn.id, 1)
              }
            />
            <IconButton
              icon={Trash2}
              label={bi(`从歌单移除 ${title}`, `Remove ${title} from playlist`)}
              onPress={() =>
                useAppStore.getState().removePlaylistHymn(playlistId, hymn.id)
              }
            />
          </View>
        )}
      </View>
    );
  };
  if (virtualized) {
    return (
      <FlatList
        {...listProps}
        ref={listRef}
        data={hymns}
        renderItem={({ item, index }) => renderRow(item, index)}
        keyExtractor={(hymn) => hymn.id}
        initialNumToRender={10}
        maxToRenderPerBatch={8}
        windowSize={5}
        showsVerticalScrollIndicator={false}
      />
    );
  }
  return <View>{hymns.map(renderRow)}</View>;
}
