import React, { useRef } from "react";
import { TextInput, View, useWindowDimensions } from "react-native";
import { Plus } from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type { HymnReference, MusicPlaylist } from "../../domain/music-library";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Button, Dialog, Txt, inputStyle } from "../../shared/ui";
import { useTheme } from "../../shared/theme-context";
import { HymnActionsDialog } from "./HymnActionsDialog";

export type MusicLibraryAction =
  | {
      kind: "song";
      hymn: HymnReference;
      playlistId?: string;
      favorites?: boolean;
    }
  | { kind: "add"; hymn: HymnReference }
  | {
      kind: "edit";
      id?: string;
      hymn?: HymnReference;
      name: string;
      error?: string;
    }
  | { kind: "delete"; playlist: MusicPlaylist };

export function MusicLibraryDialogs({
  action,
  setAction,
  catalog,
  onSaved,
  onDeleted,
}: {
  action: MusicLibraryAction | null;
  setAction: (action: MusicLibraryAction | null) => void;
  catalog: AudioTrack[];
  onSaved?: (id: string) => void;
  onDeleted?: () => void;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const presentation = useWindowDimensions().width < 760 ? "bottom" : "center";
  const playlists = useAppStore((s) => s.musicPlaylists);
  const submitted = useRef<MusicLibraryAction | null>(null);
  const edit = action?.kind === "edit" ? action : null;
  const add = action?.kind === "add" ? action : null;
  const deleting = action?.kind === "delete" ? action.playlist : null;
  const close = () => setAction(null);

  function addSong(id: string, hymn: HymnReference) {
    const store = useAppStore.getState();
    const [added] = store.addPlaylistHymns(id, [hymn]);
    if (added)
      store.notify(bi("已加入歌单", "Added to playlist"), {
        label: bi("撤销", "Undo"),
        run: () => useAppStore.getState().removePlaylistHymn(id, added.id),
      });
    close();
  }

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
    if (edit.hymn) addSong(id, edit.hymn);
    else {
      close();
      onSaved?.(id);
    }
  }

  if (action?.kind === "song") {
    return (
      <HymnActionsDialog
        key={`${action.hymn.id}:${action.playlistId ?? "catalog"}`}
        hymn={action.hymn}
        track={catalog.find((track) => track.id === action.hymn.id)}
        playlistId={action.playlistId}
        favorites={action.favorites}
        onAdd={() => setAction({ kind: "add", hymn: action.hymn })}
        onClose={close}
      />
    );
  }

  const title = edit
    ? edit.id
      ? bi("重命名歌单", "Rename playlist")
      : bi("新建歌单", "New playlist")
    : add
      ? bi("加入歌单", "Add to playlist")
      : bi("删除这张歌单？", "Delete this playlist?");
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
      <Button secondary onPress={close}>
        {bi("保留歌单", "Keep playlist")}
      </Button>
      <Button
        style={{ backgroundColor: c.danger }}
        onPress={() => {
          useAppStore.getState().deleteMusicPlaylist(deleting.id);
          close();
          onDeleted?.();
        }}
      >
        {bi("确认删除歌单", "Delete playlist")}
      </Button>
    </View>
  ) : undefined;
  return (
    <Dialog
      visible={!!action}
      onClose={close}
      title={title}
      width={640}
      presentation={presentation}
      heightMode={add && playlists.length > 5 ? "large" : "content"}
      keyboardAware={!!edit}
      footer={footer}
    >
      {add && (
        <View style={{ padding: 20, gap: 12 }}>
          <Txt style={{ color: c.textMuted }}>{add.hymn.title}</Txt>
          {playlists.map((playlist) => {
            const included = playlist.hymns.some(
              (hymn) => hymn.id === add.hymn.id,
            );
            return (
              <Button
                key={playlist.id}
                secondary
                disabled={included}
                onPress={() => addSong(playlist.id, add.hymn)}
              >
                {included
                  ? bi(`已加入 ${playlist.name}`, `Already in ${playlist.name}`)
                  : bi(`加入 ${playlist.name}`, `Add to ${playlist.name}`)}
              </Button>
            );
          })}
          <Button
            icon={Plus}
            secondary={playlists.length > 0}
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
            placeholderTextColor={c.textMuted}
            value={edit.name}
            maxLength={60}
            onChangeText={(name) =>
              setAction({ ...edit, name, error: undefined })
            }
            onSubmitEditing={save}
            returnKeyType="done"
            style={inputStyle(c)}
          />
          {!!edit.error && (
            <Txt accessibilityRole="alert" style={{ color: c.danger }}>
              {edit.error}
            </Txt>
          )}
        </View>
      )}
      {deleting && (
        <Txt style={{ color: c.textMuted, padding: 20, lineHeight: 23 }}>
          {bi(
            `将删除「${deleting.name}」。收藏的歌曲会保留。`,
            `Delete “${deleting.name}”? Your favorites will be kept.`,
          )}
        </Txt>
      )}
    </Dialog>
  );
}
