import { useCallback } from "react";
import { router, useFocusEffect } from "expo-router";
import { useAudio } from "./AudioProvider";
import { locatePlayingScripture } from "./locate-playing-scripture";

export function MediaPlaybackScreen() {
  const { track } = useAudio();

  useFocusEffect(
    useCallback(() => {
      if (track?.kind === "hymn") router.replace("/now-playing");
      else if (track && locatePlayingScripture(track)) router.replace("/bible");
      else router.replace("/");
    }, [track]),
  );

  return null;
}
