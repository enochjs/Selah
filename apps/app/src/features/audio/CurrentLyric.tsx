import React, { useMemo } from "react";
import { activeLyricIndex, parseLyrics } from "../../domain/lyrics";
import { useI18n } from "../../shared/i18n";
import { useAudio, useAudioProgress } from "./AudioProvider";
import { LyricMarquee } from "./LyricMarquee";

/** Only this small view subscribes to playback ticks. */
export function CurrentLyric({ compact = false }: { compact?: boolean }) {
  const { track, playing } = useAudio();
  const { position, duration } = useAudioProgress();
  const { bi } = useI18n();
  const lyrics = useMemo(
    () => parseLyrics(track?.lyrics, duration),
    [track?.lyrics, duration],
  );
  const index = activeLyricIndex(lyrics.lines, position);
  const current = lyrics.timed
    ? lyrics.lines[index]?.text.trim().replace(/\s*\n\s*/g, " · ")
    : undefined;
  const fallback =
    track?.hymn?.artist?.trim() ||
    track?.subtitle?.trim() ||
    bi("查看歌词", "View lyrics");
  const text = current || fallback;
  return (
    <LyricMarquee
      key={`${track?.id}:${index}:${text}`}
      text={text}
      playing={playing && !!current}
      compact={compact}
    />
  );
}
