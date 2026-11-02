import React, { useRef, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { Play, Pause, Music2, Trash2 } from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { customTrack } from "./catalog";
import { audioUri, deleteAudio } from "./media-storage";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Button, IconButton, Panel, Dialog } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import type { CustomSong } from "../../domain/models";

export function LegacySongsPanel() {
  const { bi } = useI18n();
  const audio = useAudio();
  const mobile = useWindowDimensions().width < 760;
  const songs = useAppStore((s) => s.songs),
    notify = useAppStore((s) => s.notify);
  const [remove, setRemove] = useState<CustomSong | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const removingRef = useRef(false);
  async function removeTrack() {
    if (!remove || removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError("");
    try {
      if (audio.track?.id === remove.id && audio.playing) audio.toggle();
      await deleteAudio(remove.uri);
      useAppStore.getState().removeSong(remove.id);
      setRemove(null);
    } catch {
      setRemoveError(
        bi(
          "移除失败，请重试。",
          "Could not remove the track. Please try again.",
        ),
      );
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  }
  function closeRemove() {
    if (!removingRef.current) {
      setRemove(null);
      setRemoveError("");
    }
  }
  async function playCustom(song: CustomSong) {
    try {
      const tracks = await Promise.all(
        songs.map(async (s) => customTrack(s, await audioUri(s.uri))),
      );
      audio.playQueue(
        tracks,
        songs.findIndex((s) => s.id === song.id),
      );
    } catch {
      notify(
        bi(
          "无法读取历史音频，请检查文件是否仍在设备上。",
          "Unable to read this recording. Check that the file is still on this device.",
        ),
      );
    }
  }
  if (!songs.length) return null;
  return (
    <>
      <Panel style={{ marginTop: 34, padding: mobile ? 21 : 27 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <View style={{ flex: 1, gap: 7 }}>
            <Txt style={{ fontSize: 20, fontFamily: fonts.medium }}>
              {bi("历史本地诗歌", "Previous local recordings")}
            </Txt>
            <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 20 }}>
              {bi(
                "此前保存在设备上的录音仍可播放和移除。",
                "Recordings already saved on this device remain available.",
              )}
            </Txt>
          </View>
        </View>
        {songs.map((song, i) => (
          <View
            key={song.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 14,
              paddingVertical: 15,
              borderTopWidth: 1,
              borderColor: c.border,
              marginTop: i ? 0 : 20,
            }}
          >
            <Music2 size={17} color={c.green} />
            <Pressable
              accessibilityRole="button"
              onPress={() => playCustom(song)}
              style={{
                flex: 1,
                gap: 6,
                minHeight: 44,
                justifyContent: "center",
              }}
            >
              <Txt style={{ fontSize: 13 }}>{song.title}</Txt>
              <Txt style={{ fontSize: 12, color: c.muted }}>
                {bi(
                  "历史本地录音 · 离线可用",
                  "Previous recording · Available offline",
                )}
              </Txt>
            </Pressable>
            <IconButton
              icon={audio.track?.id === song.id && audio.playing ? Pause : Play}
              onPress={() =>
                audio.track?.id === song.id ? audio.toggle() : playCustom(song)
              }
              label={
                audio.track?.id === song.id
                  ? audio.playing
                    ? bi("暂停诗歌", "Pause track")
                    : bi("继续播放诗歌", "Resume track")
                  : bi("播放诗歌", "Play track")
              }
              active={audio.track?.id === song.id}
              size={16}
            />
            <IconButton
              icon={Trash2}
              onPress={() => {
                setRemoveError("");
                setRemove(song);
              }}
              label={bi("移除诗歌", "Remove track")}
              size={14}
            />
          </View>
        ))}
      </Panel>
      <Dialog
        visible={!!remove}
        onClose={closeRemove}
        title={bi("移除这首诗歌？", "Remove this track?")}
        dismissible={!removing}
        presentation={mobile ? "bottom" : "center"}
        heightMode="content"
        footer={
          <View style={{ padding: 20, gap: 10 }}>
            {!!removeError && (
              <Txt
                accessibilityRole="alert"
                style={{ color: c.red, fontSize: 13, lineHeight: 21 }}
              >
                {removeError}
              </Txt>
            )}
            <Button secondary disabled={removing} onPress={closeRemove}>
              {bi("保留诗歌", "Keep track")}
            </Button>
            <Button
              style={{ backgroundColor: c.red }}
              disabled={removing}
              onPress={removeTrack}
            >
              {removing
                ? bi("正在移除…", "Removing…")
                : bi("确认移除", "Remove track")}
            </Button>
          </View>
        }
      >
        <Txt style={{ lineHeight: 23, color: c.muted }}>
          {bi(
            `将从本地收藏中移除「${remove?.title}」，原始文件不受影响。`,
            `“${remove?.title}” will be removed from this library. Your original file is kept.`,
          )}
        </Txt>
      </Dialog>
    </>
  );
}
