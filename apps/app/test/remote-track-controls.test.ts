import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack, RepeatMode } from "../src/domain/models";

const context = vi.hoisted(() => ({
  queue: [] as AudioTrack[],
  index: 0,
  repeat: "off" as RepeatMode,
  cleanups: [] as (() => void)[],
  listeners: new Map<string, (event: { direction: string }) => void>(),
  remove: vi.fn(),
  notify: vi.fn(),
  player: {
    currentTime: 0,
    playing: false,
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    setActiveForLockScreen: vi.fn(),
    updateLockScreenMetadata: vi.fn(),
    addListener: vi.fn(),
  },
}));
vi.mock("react", async (original) => {
  const react = await original<typeof React>();
  return {
    ...react,
    useEffect: (effect: () => unknown) => {
      const cleanup = effect();
      if (typeof cleanup === "function")
        context.cleanups.push(cleanup as () => void);
    },
    useState: (initial: unknown) => {
      if (typeof initial === "object" && initial && "queue" in initial)
        return [{ queue: context.queue, index: context.index }, vi.fn()];
      if (initial === "off") return [context.repeat, vi.fn()];
      return react.useState(initial);
    },
  };
});
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("expo-asset", () => ({ Asset: { loadAsync: async () => [] } }));
vi.mock("expo-audio", () => ({
  useAudioPlayer: () => context.player,
  useAudioPlayerStatus: () => ({ playing: false }),
  setAudioModeAsync: async () => {},
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(() => context.notify, {
    subscribe: () => () => {},
  }),
}));
vi.mock("../src/features/audio/audio-engine", () => ({ configurePlayer() {} }));
vi.mock("../src/features/audio/catalog", () => ({ chapterTracks: () => [] }));
vi.mock("../src/config/resources", () => ({
  resourceServerUrl: () => "https://example.test",
}));
vi.mock("../src/data/resource-info", () => ({ englishVersion: "NIV" }));
vi.mock("../src/data/offline-audio-runtime", () => ({
  downloadManager: { resolveSource: async (source: unknown) => source },
}));

import { AudioProvider, useAudio } from "../src/features/audio/AudioProvider";

let audio: ReturnType<typeof useAudio>;
function Probe() {
  audio = useAudio();
  return null;
}
function render() {
  renderToStaticMarkup(
    React.createElement(AudioProvider, null, React.createElement(Probe)),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  context.listeners.clear();
  context.cleanups = [];
  context.index = 0;
  context.repeat = "off";
  context.queue = [1, 2, 3].map((verse) => ({
    id: `leviticus-6-${verse}`,
    kind: "scripture",
    title: `Leviticus 6:${verse}`,
    subtitle: "",
    artwork: 1,
    source: { uri: "https://example.test/leviticus6.mp3" },
    startTime: (verse - 1) * 10,
    endTime: verse * 10,
    duration: 10,
  }));
  context.player.addListener.mockImplementation((event, listener) => {
    context.listeners.set(event, listener);
    return { remove: context.remove };
  });
});

it("enables system next and previous for a verse inside the chapter", () => {
  context.index = 1;
  render();
  expect(context.player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ title: "Leviticus 6:2" }),
    { showNextTrack: true, showPreviousTrack: true },
  );
});

it("routes system track commands through the current verse queue without replacing chapter audio", async () => {
  render();
  audio.playQueue(context.queue);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  const command = context.listeners.get("remoteTrackChange");
  expect(command).toBeTypeOf("function");
  command!({ direction: "next" });
  await vi.waitFor(() =>
    expect(context.player.seekTo).toHaveBeenLastCalledWith(10, 0, 0),
  );
  command!({ direction: "previous" });
  await vi.waitFor(() =>
    expect(context.player.seekTo).toHaveBeenLastCalledWith(0, 0, 0),
  );
  expect(context.player.replace).toHaveBeenCalledOnce();
  expect(context.notify).not.toHaveBeenCalled();
  context.cleanups.forEach((cleanup) => cleanup());
  expect(context.remove).toHaveBeenCalledTimes(2);
});

it("disables next at the end of the queue", () => {
  context.index = 2;
  render();
  expect(context.player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.anything(),
    { showNextTrack: false, showPreviousTrack: true },
  );
});

it("uses the latest hymn queue when a system command arrives", async () => {
  render();
  audio.playQueue(context.queue);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  const hymns = context.queue.slice(0, 2).map((track, index) => ({
    ...track,
    kind: "hymn" as const,
    source: { uri: `https://example.test/hymn${index}.mp3` },
    startTime: undefined,
    endTime: undefined,
  }));
  audio.playQueue(hymns);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledTimes(2));
  context.listeners.get("remoteTrackChange")!({ direction: "next" });
  await vi.waitFor(() =>
    expect(context.player.replace).toHaveBeenLastCalledWith(hymns[1].source),
  );
});

it("keeps manual next available during verse repeat", () => {
  context.repeat = "verse";
  render();
  expect(context.player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.anything(),
    { showNextTrack: true, showPreviousTrack: true },
  );
});

it("allows next at the end when queue repeat is enabled", () => {
  context.repeat = "chapter";
  context.index = 2;
  render();
  expect(context.player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.anything(),
    { showNextTrack: true, showPreviousTrack: true },
  );
});

it("clears system controls when the queue is empty", () => {
  context.queue = [];
  render();
  expect(context.player.setActiveForLockScreen).toHaveBeenCalledWith(false);
});
