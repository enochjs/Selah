import React, { useRef } from "react";
import { View, TextInput, useWindowDimensions } from "react-native";
import { Plus } from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type {
  CloudPlaylist,
  HymnReference,
  MusicPlaylist,
} from "../../domain/music-library";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Button, Dialog, Txt, inputStyle } from "../../shared/ui";
import { colors as c } from "../../shared/theme";
import { PlaylistDetails, type PlaylistSelection } from "./PlaylistDetails";

export type MusicLibraryAction =
  | { kind: "details"; selection: PlaylistSelection }
  | { kind: "add"; hymn: HymnReference }
  | {
      kind: "edit";
      id?: string;
      hymn?: HymnReference;
      name: string;
      error?: string;
    }
  | { kind: "delete"; playlist: MusicPlaylist };

/** One native modal stays open as the user moves between playlist actions. */
export function MusicLibraryDialogs({
  action,
  setAction,
  catalog,
  cloudPlaylists,
  onBrowse,
}: {
  action: MusicLibraryAction | null;
  setAction: (action: MusicLibraryAction | null) => void;
  catalog: AudioTrack[];
  cloudPlaylists: CloudPlaylist[];
  onBrowse: () => void;
}) {
  const { bi, locale } = useI18n();
  const presentation = useWindowDimensions().width < 760 ? "bottom" : "center";
  const playlists = useAppStore((s) => s.musicPlaylists);
  const submitted = useRef<MusicLibraryAction | null>(null);
  const edit = action?.kind === "edit" ? action : null;
  const add = action?.kind === "add" ? action : null;
  const deleting = action?.kind === "delete" ? action.playlist : null;
  const selection = action?.kind === "details" ? action.selection : null;
  const personal =
    selection?.kind === "personal"
      ? playlists.find((p) => p.id === selection.id)
      : undefined;
  const cloud =
    selection?.kind === "cloud"
      ? cloudPlaylists.find((p) => p.id === selection.id)
      : undefined;
  const detailsTitle =
    selection?.kind === "favorites"
      ? bi("我喜欢的", "Liked songs")
      : (personal?.name ??
        (cloud
          ? locale === "zh"
            ? cloud.titleZh
            : cloud.titleEn
          : bi("歌单暂不可用", "Playlist unavailable")));
  const title = edit
    ? edit.id
      ? bi("重命名歌单", "Rename playlist")
      : bi("新建歌单", "New playlist")
    : add
      ? bi("添加到歌单", "Add to playlist")
      : deleting
        ? bi("删除这张歌单？", "Delete this playlist?")
        : detailsTitle;
  const close = () => setAction(null);
  function save() {
    if (!edit || submitted.current === edit) return;
    const store = useAppStore.getState();
    const id = edit.id
      ? store.renameMusicPlaylist(edit.id, edit.name)
        ? edit.id
        : null
      : store.createMusicPlaylist(edit.name);
    if (!id) {
      setAction({
        ...edit,
        error: bi(
          "请输入 1–60 个字符的歌单名称",
          "Enter a playlist name of 1–60 characters",
        ),
      });
      return;
    }
    submitted.current = edit;
    if (edit.hymn) store.addPlaylistHymn(id, edit.hymn);
    setAction({ kind: "details", selection: { kind: "personal", id } });
  }
  function keepPlaylist() {
    if (deleting)
      setAction({
        kind: "details",
        selection: { kind: "personal", id: deleting.id },
      });
    else close();
  }
  const footer = edit ? (
    <View style={{ padding: 20 }}>
      <Button onPress={save}>
        {edit.id
          ? bi("保存名称", "Save name")
          : bi("创建歌单", "Create playlist")}
      </Button>
    </View>
  ) : deleting ? (
    <View style={{ padding: 20, gap: 10 }}>
      <Button secondary onPress={keepPlaylist}>
        {bi("保留歌单", "Keep playlist")}
      </Button>
      <Button
        style={{ backgroundColor: c.red }}
        onPress={() => {
          useAppStore.getState().deleteMusicPlaylist(deleting.id);
          close();
        }}
      >
        {bi("确认删除歌单", "Delete playlist")}
      </Button>
    </View>
  ) : undefined;
  return (
    <Dialog
      visible={!!action}
      onClose={deleting ? keepPlaylist : close}
      title={title}
      width={720}
      presentation={presentation}
      heightMode={
        selection || (add && playlists.length > 5) ? "large" : "content"
      }
      keyboardAware={!!edit}
      footer={footer}
    >
      {selection && (
        <PlaylistDetails
          selection={selection}
          catalog={catalog}
          cloudPlaylists={cloudPlaylists}
          onBrowse={onBrowse}
          onAdd={(hymn) => setAction({ kind: "add", hymn })}
          onRename={(playlist) =>
            setAction({ kind: "edit", id: playlist.id, name: playlist.name })
          }
          onDelete={(playlist) => setAction({ kind: "delete", playlist })}
        />
      )}
      {add && (
        <View style={{ padding: 20, gap: 12 }}>
          <Txt style={{ color: c.muted }}>{add.hymn.title}</Txt>
          {playlists.map((playlist) => {
            const included = playlist.hymns.some(
              (hymn) => hymn.id === add.hymn.id,
            );
            return (
              <Button
                key={playlist.id}
                secondary
                disabled={included}
                onPress={() => {
                  useAppStore.getState().addPlaylistHymn(playlist.id, add.hymn);
                  useAppStore
                    .getState()
                    .notify(bi("已加入歌单", "Added to playlist"));
                  close();
                }}
              >
                {included
                  ? bi(`已加入 ${playlist.name}`, `Already in ${playlist.name}`)
                  : bi(`加入 ${playlist.name}`, `Add to ${playlist.name}`)}
              </Button>
            );
          })}
          {!playlists.length && (
            <Txt style={{ color: c.muted, lineHeight: 22 }}>
              {bi(
                "创建你的第一张歌单，把喜欢的歌曲放在一起。",
                "Create your first playlist to keep your favorite songs together.",
              )}
            </Txt>
          )}
          <Button
            icon={Plus}
            onPress={() =>
              setAction({ kind: "edit", name: "", hymn: add.hymn })
            }
          >
            {bi("新建歌单", "New playlist")}
          </Button>
        </View>
      )}
      {edit && (
        <View style={{ padding: 20, gap: 10 }}>
          <TextInput
            accessibilityLabel={bi("歌单名称", "Playlist name")}
            placeholder={bi("给歌单起个名字", "Give your playlist a name")}
            placeholderTextColor={c.muted}
            value={edit.name}
            maxLength={60}
            onChangeText={(name) =>
              setAction({ ...edit, name, error: undefined })
            }
            onSubmitEditing={save}
            returnKeyType="done"
            style={inputStyle}
          />
          {!!edit.error && (
            <Txt
              accessibilityRole="alert"
              style={{ color: c.red, fontSize: 12 }}
            >
              {edit.error}
            </Txt>
          )}
        </View>
      )}
      {deleting && (
        <Txt style={{ padding: 20, color: c.muted, lineHeight: 23 }}>
          {bi(
            `将删除「${deleting.name}」。收藏的歌曲会保留。`,
            `Delete “${deleting.name}”? Your liked songs will be kept.`,
          )}
        </Txt>
      )}
    </Dialog>
  );
}
