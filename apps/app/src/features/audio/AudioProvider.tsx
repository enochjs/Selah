import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { Platform } from "react-native";
import { Asset } from "expo-asset";
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import type { AudioTrack, RepeatMode } from "../../domain/models";
import {
  AudioSession,
  trackPosition,
  trackDuration,
} from "../../domain/audio-session";
import { useAppStore } from "../../state/app-store";
import { chapterTracks } from "./catalog";
import { bibleRepository } from "../../data/bible-repository";
import { adjacentChapter } from "../../domain/reading";
import { getChapterRecording } from "../../data/audio-repository";
import { isVerseMissing } from "../../domain/scripture-audio";
import { createRangePlayback } from "./create-range-playback";
import { resourceServerUrl } from "../../config/resources";
import { englishVersion } from "../../data/resource-info";
import { downloadManager } from "../../data/offline-audio-runtime";
import { nextTrackIndex } from "../../domain/playback";

// expo-audio's native patch routes system transport commands to our logical
// queue while its single player continues to own the original chapter audio.
type RemoteTrackPlayer = ReturnType<typeof useAudioPlayer> & {
  addListener(
    event: "remoteTrackChange",
    listener: (event: { direction: "next" | "previous" }) => void,
  ): { remove(): void };
};

type AudioContextValue = {
  track: AudioTrack | null;
  playing: boolean;
  buffering: boolean;
  repeat: RepeatMode;
  rate: number;
  volume: number;
  queue: AudioTrack[];
  index: number;
  playQueue: (tracks: AudioTrack[], index?: number) => void;
  toggle: () => void;
  seek: (time: number) => void;
  playFrom: (time: number) => void;
  next: () => void;
  previous: () => void;
  setRepeat: (mode: RepeatMode) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
};
const AudioContext = createContext<AudioContextValue | null>(null);
const AudioClockContext = createContext<ReturnType<
  typeof useAudioPlayer
> | null>(null);
export function AudioProvider({ children }: PropsWithChildren) {
  const player = useAudioPlayer(null, {
    updateInterval: 100,
    keepAudioSessionActive: true,
  });
  const status = useAudioPlayerStatus(player);
  const [{ queue, index }, setSelection] = useState<{
    queue: AudioTrack[];
    index: number;
  }>({ queue: [], index: 0 });
  const [repeat, updateRepeat] = useState<RepeatMode>("off"),
    [rate, setRate] = useState(1),
    [volume, setVolume] = useState(0.8);
  const notify = useAppStore((s) => s.notify);
  const playback = useMemo(() => createRangePlayback(player), [player]);
  const session = useMemo(
    () =>
      new AudioSession(
        playback,
        (tracks, selected) => {
          setSelection({ queue: tracks, index: selected });
        },
        (message) =>
          notify(
            message.includes("SelahAudioRanges")
              ? "经节循环需要安装新版 App / Install a new native build for verse looping."
              : "音频加载失败，请确认资源服务已启动 / Audio unavailable. Check the resource server.",
          ),
        (source) => downloadManager.resolveSource(source),
        (track) => {
          if (!track.bookId || !track.chapter || !track.locale) return [];
          const next = adjacentChapter(
            bibleRepository.listBooks(),
            track.bookId,
            track.chapter,
            1,
          );
          if (!next) return [];
          const tracks = chapterTracks(next.bookId, next.chapter, track.locale);
          if (!tracks.length)
            notify(
              "下一章音频暂不可用，已停止。 / Next chapter audio is unavailable. Playback stopped.",
            );
          return tracks;
        },
      ),
    [playback, notify],
  );
  useEffect(
    () =>
      useAppStore.subscribe((state, previous) => {
        if (state.primaryLocale === previous.primaryLocale) return;
        const track = session.track;
        if (
          track?.kind !== "scripture" ||
          !track.bookId ||
          !track.chapter ||
          track.locale === state.primaryLocale
        )
          return;
        const tracks = chapterTracks(
          track.bookId,
          track.chapter,
          state.primaryLocale,
        );
        void session.switchNarration(tracks).then((switched) => {
          if (
            switched ||
            useAppStore.getState().primaryLocale !== state.primaryLocale
          )
            return;
          const missing =
            track.verse !== undefined &&
            isVerseMissing(
              getChapterRecording(
                track.bookId!,
                track.chapter!,
                state.primaryLocale,
              ),
              track.verse,
            );
          notify(
            missing
              ? "原录音未朗读本节，已暂停。 / This verse is not narrated in the source recording. Playback paused."
              : tracks.length
                ? "此语言暂无法定位同一经节，已暂停。可在顶部朗读入口播放整章。 / Cannot locate this verse in the selected language. Use the chapter controls to listen in full."
                : "此语言的本章音频暂不可用，已暂停。 / Chapter audio is unavailable in the selected language. Playback paused.",
          );
        });
      }),
    [session, notify],
  );
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => notify("音频初始化失败 / Audio initialization failed"));
    const subscription = player.addListener("playbackStatusUpdate", (s) => {
      void session.onStatus(playback.status(s));
    });
    return () => {
      subscription.remove();
      session.dispose();
    };
  }, [player, playback, session, notify]);
  const playQueue = useCallback(
    (tracks: AudioTrack[], selected = 0) => {
      void session.playQueue(tracks, selected);
    },
    [session],
  );
  useEffect(() => {
    if (Platform.OS === "web") return;
    const subscription = (player as RemoteTrackPlayer).addListener(
      "remoteTrackChange",
      ({ direction }) => {
        if (direction === "next") void session.next();
        else if (direction === "previous") void session.previous();
      },
    );
    return () => subscription.remove();
  }, [player, session]);
  const setRepeat = useCallback(
    (mode: RepeatMode) => {
      updateRepeat(mode);
      session.configure({ repeat: mode });
    },
    [session],
  );
  const track = queue[index] ?? null;
  const hasNext =
    nextTrackIndex(index, queue.length, repeat === "verse" ? "off" : repeat) !==
    null;
  useEffect(() => {
    if (Platform.OS === "web") return;
    if (!track) {
      player.setActiveForLockScreen(false);
      return;
    }
    const metadata = {
      title: track.title,
      artist: "Selah · 息语",
      albumTitle:
        track.kind === "hymn"
          ? "Hymns"
          : track.locale === "en"
            ? englishVersion
            : "和合本",
    };
    player.setActiveForLockScreen(true, metadata, {
      showNextTrack: hasNext,
      showPreviousTrack: true,
    });
    let current = true;
    // Native media controls need a readable file URL, not Metro's asset ID.
    void Asset.loadAsync(track.artwork ?? require("../../../assets/icon.png"))
      .then(([asset]) => {
        if (current && asset)
          player.updateLockScreenMetadata({
            ...metadata,
            artworkUrl: asset.localUri ?? asset.uri,
          });
      })
      .catch(() => {
        // Artwork is optional; a cache failure must not interrupt playback.
      });
    return () => {
      current = false;
    };
  }, [player, track, hasNext]);
  // The native clock still drives AudioSession every 100 ms. Screens subscribe
  // only to semantic changes, so clock ticks cannot rebuild entire chapters.
  const { isBuffering, didJustFinish } = status;
  // A native verse loop emits EOF while seeking back to its start. AudioSession
  // keeps that boundary distinct from a pause or an interruption.
  const playing =
    status.playing ||
    (repeat === "verse" && didJustFinish && session.isPlaying);
  const buffering = isBuffering || session.transitioning;
  const value = useMemo<AudioContextValue>(
    () => ({
      track,
      queue,
      index,
      playing,
      buffering,
      repeat,
      rate,
      volume,
      playQueue,
      toggle: () => {
        if (!track) {
          const state = useAppStore.getState();
          if (
            isVerseMissing(
              getChapterRecording(
                state.bookId,
                state.chapter,
                state.primaryLocale,
              ),
              state.selectedVerse,
            )
          ) {
            notify(
              "原录音未朗读本节 / This verse is not narrated in the source recording.",
            );
            return;
          }
          const tracks = chapterTracks(
            state.bookId,
            state.chapter,
            state.primaryLocale,
          );
          if (tracks.length)
            void session.playQueue(
              tracks,
              Math.max(
                0,
                tracks.findIndex(
                  (t) =>
                    t.verse === state.selectedVerse ||
                    t.coveredVerses?.includes(state.selectedVerse),
                ),
              ),
            );
          else
            notify(
              !resourceServerUrl()
                ? "请配置资源服务地址 / Configure the resource server URL"
                : "此节暂无可定位的音频 / No aligned audio for this verse",
            );
        } else if (
          player.playing ||
          session.transitioning ||
          (repeat === "verse" && didJustFinish && session.isPlaying)
        )
          session.pause();
        else if (didJustFinish) void session.playQueue(queue, index);
        else void session.resume();
      },
      seek: (time) => {
        void session
          .seek(time)
          .catch(() => notify("无法跳转 / Could not seek"));
      },
      playFrom: (time) => {
        void session.playFrom(time);
      },
      next: () => {
        void session.next();
      },
      previous: () => {
        void session.previous();
      },
      setRepeat,
      setRate: (speed) => {
        setRate(speed);
        session.configure({ rate: speed });
      },
      setVolume: (v) => {
        setVolume(v);
        session.configure({ volume: v });
      },
    }),
    [
      track,
      queue,
      index,
      playing,
      buffering,
      didJustFinish,
      repeat,
      rate,
      volume,
      session,
      player,
      notify,
      playQueue,
      setRepeat,
    ],
  );
  return (
    <AudioContext.Provider value={value}>
      <AudioClockContext.Provider value={player}>
        {children}
      </AudioClockContext.Provider>
    </AudioContext.Provider>
  );
}
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio requires AudioProvider");
  return context;
}

/** Subscribe only the lyric/progress views to clock ticks, keeping page trees stable. */
export function useAudioProgress() {
  const player = useContext(AudioClockContext);
  if (!player) throw new Error("useAudioProgress requires AudioProvider");
  const status = useAudioPlayerStatus(player);
  const { track } = useAudio();
  return {
    position: trackPosition(track, status.currentTime),
    duration: trackDuration(track, status.duration),
  };
}
