import React from "react";
import { View } from "react-native";
import { Play, PencilLine, Trash2, Plus } from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type {
  CloudPlaylist,
  HymnReference,
  MusicPlaylist,
} from "../../domain/music-library";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { Button, Txt } from "../../shared/ui";
import { colors as c } from "../../shared/theme";
import { useAudio } from "./AudioProvider";
import { HymnList } from "./HymnList";

export type PlaylistSelection =
  { kind: "cloud" | "personal"; id: string } | { kind: "favorites" };

export function PlaylistDetails({
  selection,
  catalog,
  cloudPlaylists,
  onAdd,
  onBrowse,
  onRename,
  onDelete,
}: {
  selection: PlaylistSelection | null;
  catalog: AudioTrack[];
  cloudPlaylists: CloudPlaylist[];
  onAdd: (hymn: HymnReference) => void;
  onBrowse: () => void;
  onRename: (playlist: MusicPlaylist) => void;
  onDelete: (playlist: MusicPlaylist) => void;
}) {
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const playlists = useAppStore((s) => s.musicPlaylists);
  const personal =
    selection?.kind === "personal"
      ? playlists.find((p) => p.id === selection.id)
      : undefined;
  const cloud =
    selection?.kind === "cloud"
      ? cloudPlaylists.find((p) => p.id === selection.id)
      : undefined;
  const hymns =
    selection?.kind === "favorites"
      ? favorites
      : (personal?.hymns ??
        cloud?.hymnIds.map((id) => ({
          id,
          title:
            catalog.find((track) => track.id === id)?.title ??
            bi("暂不可用的诗歌", "Unavailable hymn"),
        })) ??
        []);
  const tracks = new Map(catalog.map((track) => [track.id, track]));
  const queue = hymns.flatMap((hymn) => tracks.get(hymn.id) ?? []);
  return (
    <View style={{ padding: 20, gap: 16 }}>
      {cloud && (
        <Txt style={{ color: c.muted, lineHeight: 22 }}>
          {locale === "zh" ? cloud.descriptionZh : cloud.descriptionEn}
        </Txt>
      )}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        <Button
          small
          icon={Play}
          disabled={!queue.length}
          onPress={() => audio.playQueue(queue)}
        >
          {bi("播放全部", "Play all")}
        </Button>
        {personal && (
          <>
            <Button small secondary icon={Plus} onPress={onBrowse}>
              {bi("添加歌曲", "Add songs")}
            </Button>
            <Button
              small
              secondary
              icon={PencilLine}
              onPress={() => onRename(personal)}
            >
              {bi("重命名歌单", "Rename playlist")}
            </Button>
            <Button
              small
              secondary
              icon={Trash2}
              onPress={() => onDelete(personal)}
            >
              {bi("删除歌单", "Delete playlist")}
            </Button>
          </>
        )}
      </View>
      <Txt style={{ color: c.muted, fontSize: 12 }}>
        {bi(
          `${hymns.length} 首歌曲 · ${queue.length} 首可播放`,
          `${hymns.length} songs · ${queue.length} available`,
        )}
      </Txt>
      {!hymns.length ? (
        <View style={{ paddingVertical: 28, gap: 16, alignItems: "center" }}>
          <Txt style={{ color: c.muted }}>
            {bi("这里还没有歌曲", "No songs here yet")}
          </Txt>
          <Button secondary small onPress={onBrowse}>
            {bi("去云歌单选歌", "Explore cloud playlists")}
          </Button>
        </View>
      ) : (
        <HymnList
          hymns={hymns}
          catalog={catalog}
          onAdd={onAdd}
          playlistId={personal?.id}
        />
      )}
    </View>
  );
}
