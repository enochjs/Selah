import type { AudioTrack } from "../../domain/models";
import { useAppStore } from "../../state/app-store";

export function locatePlayingScripture(track: AudioTrack): boolean {
  if (track.kind !== "scripture" || !track.bookId || !track.chapter) return false;
  const state = useAppStore.getState();
  const verse =
    track.verse ??
    (state.bookId === track.bookId && state.chapter === track.chapter
      ? Math.max(1, state.selectedVerse)
      : 1);
  state.followNarration(track.bookId, track.chapter, verse);
  return true;
}
