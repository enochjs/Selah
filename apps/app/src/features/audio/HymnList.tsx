import React from "react";
import { View, Pressable } from "react-native";
import {
  Play,
  Pause,
  Heart,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
} from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type { HymnReference } from "../../domain/music-library";
import { useAudio } from "./AudioProvider";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { IconButton, Txt } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";

export function HymnList({
  hymns,
  catalog,
  onAdd,
  playlistId,
}: {
  hymns: HymnReference[];
  catalog: AudioTrack[];
  onAdd: (hymn: HymnReference) => void;
  playlistId?: string;
}) {
  const audio = useAudio();
  const { bi } = useI18n();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const tracks = new Map(catalog.map((track) => [track.id, track]));
  const queue = hymns.flatMap((hymn) => tracks.get(hymn.id) ?? []);
  return (
    <View>
      {hymns.map((hymn, index) => {
        const track = tracks.get(hymn.id);
        const title = track?.title ?? hymn.title;
        const reference = { id: hymn.id, title };
        const saved = favorites.some((item) => item.id === hymn.id);
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
        return (
          <View
            key={hymn.id}
            style={{
              paddingVertical: 12,
              borderTopWidth: 1,
              borderColor: c.border,
              gap: 6,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <IconButton
                icon={current && audio.playing ? Pause : Play}
                onPress={play}
                disabled={!track}
                active={current}
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
              <Pressable
                accessibilityRole="button"
                disabled={!track}
                onPress={play}
                style={{
                  flex: 1,
                  minHeight: 44,
                  justifyContent: "center",
                  gap: 5,
                }}
              >
                <Txt style={{ fontFamily: fonts.medium, fontSize: 14 }}>
                  {title}
                </Txt>
                <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 19 }}>
                  {track?.subtitle ??
                    bi(
                      "暂不可用 · 收藏记录已保留",
                      "Unavailable · Saved reference kept",
                    )}
                </Txt>
              </Pressable>
              <IconButton
                icon={Heart}
                active={saved}
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
              <IconButton
                icon={Plus}
                disabled={!track}
                onPress={() => onAdd(reference)}
                label={bi(`添加 ${title} 到歌单`, `Add ${title} to playlist`)}
              />
            </View>
            {playlistId && (
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
                    useAppStore
                      .getState()
                      .movePlaylistHymn(playlistId, hymn.id, -1)
                  }
                />
                <IconButton
                  icon={ArrowDown}
                  disabled={index === hymns.length - 1}
                  label={bi(`下移 ${title}`, `Move ${title} down`)}
                  onPress={() =>
                    useAppStore
                      .getState()
                      .movePlaylistHymn(playlistId, hymn.id, 1)
                  }
                />
                <IconButton
                  icon={Trash2}
                  label={bi(
                    `从歌单移除 ${title}`,
                    `Remove ${title} from playlist`,
                  )}
                  onPress={() =>
                    useAppStore
                      .getState()
                      .removePlaylistHymn(playlistId, hymn.id)
                  }
                />
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}
