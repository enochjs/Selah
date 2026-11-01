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
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  setAudioModeAsync,
} from "expo-audio";
import type { AudioTrack, RepeatMode } from "../../domain/models";
import { AudioSession } from "../../domain/audio-session";
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
  next: () => void;
  previous: () => void;
  setRepeat: (mode: RepeatMode) => void;
  setRate: (rate: number) => void;
  setVolume: (volume: number) => void;
};
const AudioContext = createContext<AudioContextValue | null>(null);
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
          const item = tracks[selected];
          if (!item) {
            if (Platform.OS !== "web") player.setActiveForLockScreen(false);
            return;
          }
          if (Platform.OS !== "web")
            player.setActiveForLockScreen(true, {
              title: item.title,
              artist: "Selah · 息语",
              albumTitle:
                item.kind === "hymn"
                  ? "Hymns"
                  : item.locale === "en"
                    ? englishVersion
                    : "和合本",
            });
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
    [player, playback, notify],
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
  const setRepeat = useCallback(
    (mode: RepeatMode) => {
      updateRepeat(mode);
      session.configure({ repeat: mode });
    },
    [session],
  );
  const track = queue[index] ?? null;
  // The native clock still drives AudioSession every 100 ms. Screens subscribe
  // only to semantic changes, so clock ticks cannot rebuild entire chapters.
  const { playing, isBuffering, didJustFinish } = status;
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
        } else if (player.playing || session.transitioning) session.pause();
        else if (didJustFinish) void session.playQueue(queue, index);
        else void session.resume();
      },
      seek: (time) => {
        void session
          .seek(time)
          .catch(() => notify("无法跳转 / Could not seek"));
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
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio requires AudioProvider");
  return context;
}
