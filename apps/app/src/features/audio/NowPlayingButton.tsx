import React, { useState } from "react";
import { AudioLines, Headphones } from "lucide-react-native";
import { router } from "expo-router";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { IconButton } from "../../shared/ui";
import { AudioControlsDialog } from "./AudioControlsDialog";
import { useAudio } from "./AudioProvider";

export function NowPlayingButton() {
  const audio = useAudio();
  const { bi } = useI18n();
  const [open, setOpen] = useState(false);
  if (!audio.track) return null;
  const track = audio.track;
  return (
    <>
      <IconButton
        icon={audio.playing ? AudioLines : Headphones}
        active={audio.playing}
        label={bi(
          `当前播放：${track.title}，${audio.playing ? "播放中" : "已暂停"}`,
          `Now playing: ${track.title}, ${audio.playing ? "playing" : "paused"}`,
        )}
        onPress={() => setOpen(true)}
        size={17}
      />
      <AudioControlsDialog
        visible={open}
        onClose={() => setOpen(false)}
        onLocate={() => {
          if (track.kind === "scripture" && track.bookId && track.chapter) {
            const state = useAppStore.getState();
            const verse =
              track.verse ??
              (state.bookId === track.bookId && state.chapter === track.chapter
                ? state.selectedVerse
                : 1);
            state.followNarration(track.bookId, track.chapter, verse);
            router.push("/bible");
          } else router.push("/music");
        }}
      />
    </>
  );
}
