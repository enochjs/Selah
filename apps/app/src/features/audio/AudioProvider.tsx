import React, {
  createContext,
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
import {
  AudioSession,
  trackPosition,
  trackDuration,
} from "../../domain/audio-session";
import { useAppStore } from "../../state/app-store";
import { chapterTracks } from "./catalog";
import { configurePlayer } from "./audio-engine";
import { resourceServerUrl } from "../../config/resources";
import { englishVersion } from "../../data/resource-info";

type AudioContextValue = {
  track: AudioTrack | null;
  playing: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
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
  const [repeat, setRepeat] = useState<RepeatMode>("off"),
    [rate, setRate] = useState(1),
    [volume, setVolume] = useState(0.8);
  const notify = useAppStore((s) => s.notify);
  const session = useMemo(
    () =>
      new AudioSession(
        {
          replace: (source) => player.replace(source),
          seekTo: (time) => player.seekTo(time, 0, 0),
          play: () => player.play(),
          pause: () => player.pause(),
          configure: (options) => configurePlayer(player, options),
          get currentTime() {
            return player.currentTime;
          },
        },
        (tracks, selected) => {
          setSelection({ queue: tracks, index: selected });
          const item = tracks[selected];
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
          const state = useAppStore.getState();
          if (
            item.kind === "scripture" &&
            state.bookId === item.bookId &&
            state.chapter === item.chapter
          )
            state.setSelectedVerse(item.verse ?? 1);
        },
        () =>
          notify(
            "音频加载失败，请确认资源服务已启动 / Audio unavailable. Check the resource server.",
          ),
      ),
    [player, notify],
  );
  useEffect(() => {
    setAudioModeAsync({
      playsInSilentMode: true,
      shouldPlayInBackground: true,
      interruptionMode: "doNotMix",
    }).catch(() => notify("音频初始化失败 / Audio initialization failed"));
    const subscription = player.addListener("playbackStatusUpdate", (s) => {
      void session.onStatus(s);
    });
    return () => {
      subscription.remove();
      session.dispose();
    };
  }, [player, session, notify]);
  const track = queue[index] ?? null;
  const value: AudioContextValue = {
    track,
    queue,
    index,
    playing: status.playing,
    buffering: status.isBuffering || session.transitioning,
    currentTime: trackPosition(session.playbackTrack, status.currentTime ?? 0),
    duration: trackDuration(session.playbackTrack, status.duration),
    repeat,
    rate,
    volume,
    playQueue: (tracks, selected = 0) => {
      void session.playQueue(tracks, selected);
    },
    toggle: () => {
      if (!track) {
        const state = useAppStore.getState();
        const tracks = chapterTracks(
          state.bookId,
          state.chapter,
          state.audioLocale,
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
      else if (status.didJustFinish) void session.playQueue(queue, index);
      else void session.resume();
    },
    seek: (time) => {
      void session.seek(time).catch(() => notify("无法跳转 / Could not seek"));
    },
    next: () => {
      void session.next();
    },
    previous: () => {
      void session.previous();
    },
    setRepeat: (mode) => {
      setRepeat(mode);
      session.configure({ repeat: mode });
    },
    setRate: (speed) => {
      setRate(speed);
      session.configure({ rate: speed });
    },
    setVolume: (v) => {
      setVolume(v);
      session.configure({ volume: v });
    },
  };
  return (
    <AudioContext.Provider value={value}>{children}</AudioContext.Provider>
  );
}
export function useAudio() {
  const context = useContext(AudioContext);
  if (!context) throw new Error("useAudio requires AudioProvider");
  return context;
}
