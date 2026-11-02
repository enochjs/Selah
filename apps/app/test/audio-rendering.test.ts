import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../src/domain/audio-session";
import type { AudioTrack } from "../src/domain/models";

const harness = vi.hoisted(() => ({
  cursor: 0,
  stateCursor: 0,
  effectCursor: 0,
  effects: [] as unknown[][],
  cleanups: [] as (void | (() => void))[],
  platform: { OS: "web" },
  loadArtwork: vi.fn(),
  listener: undefined as ((status: PlaybackStatus) => void) | undefined,
  states: [] as unknown[],
  memos: [] as { dependencies: unknown[]; value: unknown }[],
  status: {
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 100,
  },
  player: {
    currentTime: 0,
    playing: false,
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    setActiveForLockScreen: vi.fn(),
    updateLockScreenMetadata: vi.fn(),
    addListener: vi.fn(
      (_event: string, listener: (status: PlaybackStatus) => void) => {
        harness.listener = listener;
        return { remove() {} };
      },
    ),
  },
  notify: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (effect: () => void | (() => void), dependencies: unknown[]) => {
    const index = harness.effectCursor++;
    const previous = harness.effects[index];
    if (
      !previous ||
      dependencies.some((item, i) => !Object.is(item, previous[i]))
    ) {
      harness.cleanups[index]?.();
      harness.effects[index] = dependencies;
      harness.cleanups[index] = effect();
    }
  },
  useCallback: (callback: unknown, dependencies: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.memos[index];
    if (
      !previous ||
      dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))
    )
      harness.memos[index] = { value: callback, dependencies };
    return harness.memos[index].value;
  },
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] = next;
      },
    ];
  },
  useMemo: (create: () => unknown, dependencies: unknown[]) => {
    const index = harness.cursor++;
    const previous = harness.memos[index];
    if (
      !previous ||
      dependencies.some((item, i) => !Object.is(item, previous.dependencies[i]))
    )
      harness.memos[index] = { value: create(), dependencies };
    return harness.memos[index].value;
  },
}));
vi.mock("react-native", () => ({ Platform: harness.platform }));
vi.mock("expo-asset", () => ({
  Asset: { loadAsync: harness.loadArtwork },
}));
vi.mock("expo-audio", () => ({
  useAudioPlayer: () => harness.player,
  useAudioPlayerStatus: () => harness.status,
  setAudioModeAsync: async () => {},
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(() => harness.notify, {
    subscribe: () => () => {},
  }),
}));
vi.mock("../src/features/audio/create-range-playback", async () => {
  const { RangePlayback } =
    await import("../src/features/audio/range-playback");
  return {
    createRangePlayback: (
      player: ConstructorParameters<typeof RangePlayback>[0],
    ) =>
      new RangePlayback(player, {
        setRange: async () => 0,
        setPlaying: () => {},
      }),
  };
});
vi.mock("../src/features/audio/catalog", () => ({ chapterTracks: () => [] }));
vi.mock("../src/data/audio-repository", () => ({
  getChapterRecording: () => null,
}));
vi.mock("../src/features/audio/audio-engine", () => ({
  configurePlayer: vi.fn(),
}));
vi.mock("../src/config/resources", () => ({ resourceServerUrl: () => "" }));
vi.mock("../src/data/resource-info", () => ({ englishVersion: "NIV" }));
vi.mock("../src/data/offline-audio-runtime", () => ({
  downloadManager: { resolveSource: async (source: unknown) => source },
}));
import { AudioProvider } from "../src/features/audio/AudioProvider";

function value() {
  harness.cursor = 0;
  harness.stateCursor = 0;
  harness.effectCursor = 0;
  return AudioProvider({ children: null }).props.value;
}
beforeEach(() => {
  harness.memos = [];
  harness.states = [];
  harness.effects = [];
  harness.cleanups = [];
  harness.platform.OS = "web";
  harness.loadArtwork.mockReset();
  harness.loadArtwork.mockResolvedValue([
    {
      localUri: "file:///cache/morning.jpg",
      uri: "https://example.test/morning.jpg",
    },
  ]);
  harness.listener = undefined;
  vi.clearAllMocks();
  harness.status.playing = false;
  harness.status.isBuffering = false;
  harness.status.currentTime = 0;
  harness.status.didJustFinish = false;
  harness.player.playing = false;
  harness.player.currentTime = 0;
  harness.player.play.mockImplementation(() => {
    harness.player.playing = true;
  });
  harness.player.pause.mockImplementation(() => {
    harness.player.playing = false;
  });
});

const verse: AudioTrack = {
  id: "psalm-25-2",
  kind: "scripture",
  title: "Psalm 25:2",
  subtitle: "",
  artwork: 1,
  source: { uri: "https://example.test/psalm25.mp3" },
  startTime: 4,
  endTime: 10,
};
function status(update: Partial<typeof harness.status>) {
  Object.assign(harness.status, update);
  harness.player.currentTime = harness.status.currentTime;
  harness.player.playing = harness.status.playing;
  harness.listener?.(harness.status);
  return value();
}
async function startVerseLoop() {
  const audio = value();
  audio.setRepeat("verse");
  audio.playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  return status({ playing: true, currentTime: 9.9 });
}
it("keeps the pause control active across native verse-loop completion and rewind", async () => {
  expect((await startVerseLoop()).playing).toBe(true);
  expect(
    status({ playing: false, didJustFinish: true, currentTime: 10 }).playing,
  ).toBe(true);
  expect(
    status({ playing: true, didJustFinish: false, currentTime: 4 }).playing,
  ).toBe(true);
  expect(harness.player.seekTo).toHaveBeenCalledOnce();
  expect(harness.player.play).toHaveBeenCalledOnce();
});
it("pauses instead of restarting when tapped during native verse-loop completion", async () => {
  await startVerseLoop();
  const boundary = status({
    playing: false,
    didJustFinish: true,
    currentTime: 10,
  });
  const pauses = harness.player.pause.mock.calls.length;
  boundary.toggle();
  await vi.waitFor(() => expect(value().buffering).toBe(false));
  expect(harness.player.pause).toHaveBeenCalledTimes(pauses + 1);
  expect(value().playing).toBe(false);
  expect(harness.player.seekTo).toHaveBeenCalledOnce();
  expect(harness.player.play).toHaveBeenCalledOnce();
});
it("still publishes native pauses and interruptions while verse repeat is selected", async () => {
  await startVerseLoop();
  expect(
    status({ playing: false, didJustFinish: false, currentTime: 7 }).playing,
  ).toBe(false);
});
it("can resume immediately after a pause before the next native status arrives", async () => {
  const audio = await startVerseLoop();
  audio.toggle();
  audio.toggle();
  expect(harness.player.play).toHaveBeenCalledTimes(2);
  expect(harness.player.seekTo).toHaveBeenCalledOnce();
});
it("does not hide completion when verse repeat is off", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true, currentTime: 9.9 });
  expect(
    status({ playing: false, didJustFinish: true, currentTime: 10 }).playing,
  ).toBe(false);
});
it("does not invalidate screen subscribers for 100 ms playback clock updates", () => {
  const initial = value();
  for (let tick = 1; tick <= 100; tick++) {
    harness.status.currentTime = tick / 10;
    expect(value()).toBe(initial);
  }
});
it("publishes playback and buffering changes immediately", () => {
  const initial = value();
  harness.status.playing = true;
  const playing = value();
  expect(playing).not.toBe(initial);
  expect(playing.playing).toBe(true);
  harness.status.isBuffering = true;
  expect(value().buffering).toBe(true);
});

it("keeps queue and repeat commands stable when playback status changes", () => {
  const initial = value();
  harness.status.playing = true;
  const playing = value();
  expect(playing.playQueue).toBe(initial.playQueue);
  expect(playing.setRepeat).toBe(initial.setRepeat);
});

it.each(["android", "ios"])(
  "publishes the bundled cover as a local file to %s media controls",
  async (platform) => {
    harness.platform.OS = platform;
    value().playQueue([verse]);
    value();
    await vi.waitFor(() =>
      expect(harness.player.updateLockScreenMetadata).toHaveBeenCalledWith({
        title: verse.title,
        artist: "Selah · 息语",
        albumTitle: "和合本",
        artworkUrl: "file:///cache/morning.jpg",
      }),
    );
    expect(harness.loadArtwork).toHaveBeenCalledWith(verse.artwork);
    expect(harness.player.play).toHaveBeenCalledOnce();
  },
);

it("does not let an older cover replace the current track's metadata", async () => {
  harness.platform.OS = "android";
  let finishOldCover!: (assets: { localUri: string; uri: string }[]) => void;
  harness.loadArtwork.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOldCover = resolve;
      }),
  );
  const audio = value();
  audio.playQueue([verse]);
  value();
  audio.playQueue([{ ...verse, id: "next", title: "Psalm 25:3", artwork: 2 }]);
  value();
  await vi.waitFor(() =>
    expect(harness.player.updateLockScreenMetadata).toHaveBeenCalledOnce(),
  );
  finishOldCover([{ localUri: "file:///cache/old.jpg", uri: "" }]);
  await Promise.resolve();
  expect(harness.player.updateLockScreenMetadata).toHaveBeenCalledOnce();
  expect(harness.player.updateLockScreenMetadata.mock.lastCall?.[0].title).toBe(
    "Psalm 25:3",
  );
});

it("keeps audio playing when artwork cannot be loaded", async () => {
  harness.platform.OS = "ios";
  harness.loadArtwork.mockRejectedValueOnce(new Error("Artwork unavailable"));
  value().playQueue([verse]);
  value();
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  expect(harness.player.setActiveForLockScreen).toHaveBeenCalledWith(
    true,
    expect.objectContaining({ title: verse.title }),
  );
  expect(harness.player.updateLockScreenMetadata).not.toHaveBeenCalled();
  expect(harness.notify).not.toHaveBeenCalled();
});

it("does not load native lock-screen artwork on web", async () => {
  value().playQueue([verse]);
  value();
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  expect(harness.loadArtwork).not.toHaveBeenCalled();
  expect(harness.player.setActiveForLockScreen).not.toHaveBeenCalled();
});
