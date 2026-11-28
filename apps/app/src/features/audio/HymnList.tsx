import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  View,
  Pressable,
  type FlatListProps,
  type ListRenderItemInfo,
} from "react-native";
import {
  Play,
  Pause,
  Heart,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  MoreHorizontal,
  Check,
} from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type { HymnReference } from "../../domain/music-library";
import { useAudio } from "./AudioProvider";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { IconButton, Txt } from "../../shared/ui";
import { formatTime } from "../../domain/playback";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { HymnDownloadButton } from "../downloads/HymnDownloadButton";

const keyExtractor = (hymn: HymnReference) => hymn.id;

interface DownloadSelectRowProps {
  hymn: HymnReference;
  track?: AudioTrack;
  checked: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

const DownloadSelectRow = React.memo(function DownloadSelectRow({
  hymn,
  track,
  checked,
  disabled,
  onToggle,
}: DownloadSelectRowProps) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const title = track?.title ?? hymn.title;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={bi(`选择 ${title}`, `Select ${title}`)}
      accessibilityState={{ checked, disabled }}
      disabled={disabled}
      onPress={() => onToggle(hymn.id)}
      style={({ pressed }) => ({
        flexDirection: "row",
        minHeight: 60,
        paddingVertical: 12,
        alignItems: "center",
        gap: 12,
        borderTopWidth: 1,
        borderColor: c.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt
          numberOfLines={2}
          style={{ fontFamily: fonts.medium, fontSize: 16, lineHeight: 22 }}
        >
          {title}
        </Txt>
        {!!track?.subtitle && (
          <Txt
            numberOfLines={1}
            style={{ color: c.textMuted, fontSize: 12, lineHeight: 18 }}
          >
            {track.subtitle}
          </Txt>
        )}
      </View>
      <View
        aria-hidden
        style={{
          width: 22,
          height: 22,
          marginHorizontal: 13,
          borderWidth: 1,
          borderRadius: 6,
          borderColor: checked ? c.primary : c.textMuted,
          backgroundColor: checked ? c.primary : c.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {checked && <Check size={15} color={c.onPrimary} />}
      </View>
    </Pressable>
  );
});

interface HymnRowProps {
  hymn: HymnReference;
  index: number;
  isLast: boolean;
  track?: AudioTrack;
  current: boolean;
  playing: boolean;
  hideTopBorder: boolean;
  saved: boolean;
  compact: boolean;
  showPlayButton: boolean;
  hideFavorite: boolean;
  playlistId?: string;
  onPlay: (track?: AudioTrack) => void;
  onAdd: (hymn: HymnReference) => void;
  onMore?: (hymn: HymnReference) => void;
}

const HymnRow = React.memo(function HymnRow({
  hymn,
  index,
  isLast,
  track,
  current,
  playing,
  hideTopBorder,
  saved,
  compact,
  showPlayButton,
  hideFavorite,
  playlistId,
  onPlay,
  onAdd,
  onMore,
}: HymnRowProps) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const title = track?.title ?? hymn.title;
  const reference = { id: hymn.id, title };
  const play = () => onPlay(track);
  const playButton = (
    <IconButton
      targetWidth={onMore ? 48 : compact ? 32 : 44}
      size={compact ? 18 : 19}
      icon={current && playing ? Pause : Play}
      onPress={play}
      disabled={!track}
      active={current}
      activeStyle={compact ? "surface" : "icon"}
      visualSize={compact && current ? 32 : undefined}
      label={
        !track
          ? bi(`${title} 暂不可用`, `${title} is unavailable`)
          : current
            ? playing
              ? bi(`暂停 ${title}`, `Pause ${title}`)
              : bi(`继续播放 ${title}`, `Resume ${title}`)
            : bi(`播放 ${title}`, `Play ${title}`)
      }
    />
  );
  return (
    <View
      style={{
        paddingVertical: compact ? 10 : 14,
        borderTopWidth: 1,
        borderColor: hideTopBorder ? "transparent" : c.border,
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
            backgroundColor: c.primarySoft,
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
              backgroundColor: c.primary,
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
                  ? playing
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
              color: current ? c.primaryStrong : c.text,
            }}
          >
            {title}
          </Txt>
          {compact && (
            <Txt
              numberOfLines={1}
              style={{ color: c.textMuted, fontSize: 12, lineHeight: 20 }}
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
            onPress={() => useAppStore.getState().toggleFavoriteHymn(reference)}
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
              color: c.textMuted,
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
            disabled={isLast}
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
});

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
  downloadSelection,
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
  downloadSelection?: {
    ids: ReadonlySet<string>;
    toggle: (id: string) => void;
    disabled: boolean;
  };
  listRef?: React.Ref<FlatList<HymnReference>>;
} & Pick<
  FlatListProps<HymnReference>,
  "ListHeaderComponent" | "ListFooterComponent" | "contentContainerStyle"
>) {
  const audio = useAudio();
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
  const playbackRef = useRef({ audio, queue });
  useEffect(() => {
    playbackRef.current = { audio, queue };
  }, [audio, queue]);
  const handlePlay = useCallback((track?: AudioTrack) => {
    if (!track) return;
    const { audio: currentAudio, queue: currentQueue } = playbackRef.current;
    if (currentAudio.track?.id === track.id) currentAudio.toggle();
    else
      currentAudio.playQueue(
        currentQueue,
        currentQueue.findIndex((item) => item.id === track.id),
      );
  }, []);
  const currentId = audio.track?.id;
  const playing = audio.playing;
  const renderRow = useCallback(
    (hymn: HymnReference, index: number) => {
      const track = tracks.get(hymn.id);
      if (downloadSelection) {
        return (
          <DownloadSelectRow
            key={hymn.id}
            hymn={hymn}
            track={track}
            checked={downloadSelection.ids.has(hymn.id)}
            disabled={downloadSelection.disabled}
            onToggle={downloadSelection.toggle}
          />
        );
      }
      const current = currentId === hymn.id;
      const hideTopBorder =
        compact &&
        (current || (index > 0 && currentId === hymns[index - 1]?.id));
      return (
        <HymnRow
          key={hymn.id}
          hymn={hymn}
          index={index}
          isLast={index === hymns.length - 1}
          track={track}
          current={current}
          playing={current && playing}
          hideTopBorder={hideTopBorder}
          saved={favoriteIds.has(hymn.id)}
          compact={compact}
          showPlayButton={showPlayButton}
          hideFavorite={hideFavorite}
          playlistId={playlistId}
          onPlay={handlePlay}
          onAdd={onAdd}
          onMore={onMore}
        />
      );
    },
    [
      tracks,
      downloadSelection,
      currentId,
      playing,
      compact,
      hymns,
      favoriteIds,
      showPlayButton,
      hideFavorite,
      playlistId,
      handlePlay,
      onAdd,
      onMore,
    ],
  );
  const renderItem = useCallback(
    ({ item, index }: ListRenderItemInfo<HymnReference>) =>
      renderRow(item, index),
    [renderRow],
  );
  if (virtualized) {
    return (
      <FlatList
        {...listProps}
        ref={listRef}
        data={hymns}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        removeClippedSubviews={false}
        initialNumToRender={14}
        maxToRenderPerBatch={10}
        windowSize={11}
        showsVerticalScrollIndicator={false}
      />
    );
  }
  return <View>{hymns.map(renderRow)}</View>;
}
