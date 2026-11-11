import React, { useRef, useState } from "react";
import { View, useWindowDimensions } from "react-native";
import {
  Plus,
  Download,
  ArrowUp,
  ArrowDown,
  Trash2,
} from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import type { HymnReference } from "../../domain/music-library";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Button, Dialog } from "../../shared/ui";
import {
  HymnDownloadButton,
  type HymnDownloadControlProps,
} from "../downloads/HymnDownloadButton";

interface HymnActionProps {
  hymn: HymnReference;
  track?: AudioTrack;
  playlistId?: string;
  favorites?: boolean;
  onAdd: () => void;
  onClose: () => void;
}

/** Dismiss the action sheet before presenting the existing download dialogs. */
export function HymnActionsDialog(props: HymnActionProps) {
  if (!props.track?.hymn || typeof props.track.source === "number")
    return <HymnActionSheet {...props} />;
  return (
    <HymnDownloadButton
      track={props.track}
      Control={HymnActionSheet}
      controlProps={props}
    />
  );
}

function HymnActionSheet({
  hymn,
  track,
  playlistId,
  favorites,
  onAdd,
  onClose,
  label,
  disabled,
  busy,
  onPress: download,
}: HymnActionProps & Partial<HymnDownloadControlProps>) {
  const { bi } = useI18n();
  const presentation = useWindowDimensions().width < 760 ? "bottom" : "center";
  const playlists = useAppStore((s) => s.musicPlaylists);
  const playlist = playlists.find((p) => p.id === playlistId);
  const index = playlist?.hymns.findIndex((h) => h.id === hymn.id) ?? -1;
  const [dismissedHymn, setDismissedHymn] = useState<HymnReference | null>(
    null,
  );
  const visible = dismissedHymn !== hymn;
  const pending = useRef<(() => void) | null>(null);
  function dismiss(next: () => void) {
    pending.current = next;
    setDismissedHymn(hymn);
  }
  return (
    <Dialog
      visible={visible}
      title={hymn.title}
      presentation={presentation}
      onClose={() => dismiss(onClose)}
      onDismiss={() => {
        const run = pending.current;
        pending.current = null;
        run?.();
      }}
    >
      <View style={{ padding: 20, gap: 12 }}>
        <Button
          secondary
          icon={Plus}
          disabled={!track}
          onPress={() => dismiss(onAdd)}
        >
          {bi("添加到歌单", "Add to playlist")}
        </Button>
        {download && (
          <Button
            secondary
            icon={Download}
            label={label}
            disabled={disabled || busy}
            onPress={() => {
              dismiss(download);
            }}
          >
            {bi("离线下载与管理", "Download for offline listening")}
          </Button>
        )}
        {favorites && (
          <Button
            secondary
            icon={Trash2}
            onPress={() => {
              useAppStore.getState().toggleFavoriteHymn(hymn);
              onClose();
            }}
          >
            {bi("从收藏移除", "Remove from favorites")}
          </Button>
        )}
        {playlist && (
          <>
            <Button
              secondary
              icon={ArrowUp}
              disabled={index <= 0}
              onPress={() => {
                useAppStore
                  .getState()
                  .movePlaylistHymn(playlist.id, hymn.id, -1);
                onClose();
              }}
            >
              {bi(`上移 ${hymn.title}`, `Move ${hymn.title} up`)}
            </Button>
            <Button
              secondary
              icon={ArrowDown}
              disabled={index < 0 || index >= playlist.hymns.length - 1}
              onPress={() => {
                useAppStore
                  .getState()
                  .movePlaylistHymn(playlist.id, hymn.id, 1);
                onClose();
              }}
            >
              {bi(`下移 ${hymn.title}`, `Move ${hymn.title} down`)}
            </Button>
            <Button
              secondary
              icon={Trash2}
              onPress={() => {
                useAppStore.getState().removePlaylistHymn(playlist.id, hymn.id);
                onClose();
              }}
            >
              {bi("从歌单移除", "Remove from playlist")}
            </Button>
          </>
        )}
      </View>
    </Dialog>
  );
}
