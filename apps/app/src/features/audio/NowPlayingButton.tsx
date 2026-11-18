import React, { useState } from "react";
import { AudioLines, Headphones } from "lucide-react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { IconButton } from "../../shared/ui";
import { AudioControlsDialog } from "./AudioControlsDialog";
import { useAudio } from "./AudioProvider";
import { locatePlayingScripture } from "./locate-playing-scripture";

export function NowPlayingButton({
  scriptureOnly = false,
}: {
  scriptureOnly?: boolean;
}) {
  const audio = useAudio();
  const { bi } = useI18n();
  const [open, setOpen] = useState(false);
  if (!audio.track || (scriptureOnly && audio.track.kind !== "scripture"))
    return null;
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
        onPress={() => {
          if (track.kind === "hymn") router.push("/now-playing");
          else setOpen(true);
        }}
        size={17}
      />
      <AudioControlsDialog
        visible={open}
        onClose={() => setOpen(false)}
        onLocate={() => {
          if (locatePlayingScripture(track)) router.push("/bible");
          else router.push("/now-playing");
        }}
      />
    </>
  );
}
