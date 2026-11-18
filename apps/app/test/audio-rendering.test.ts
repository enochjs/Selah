import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlaybackStatus } from "../src/domain/audio-session";
import type { AudioTrack, RepeatMode } from "../src/domain/models";

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
    isLoaded: true,
    didJustFinish: false,
    currentTime: 0,
    duration: 100,
    error: null as string | null,
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
      (event: string, listener: (status: PlaybackStatus) => void) => {
        if (event === "playbackStatusUpdate") harness.listener = listener;
        return { remove() {} };
      },
    ),
  },
  notify: vi.fn(),
  rememberHymn: vi.fn(),
  repeatMode: "off" as RepeatMode,
  scriptureRepeatMode: "off" as RepeatMode,
  setScriptureRepeatMode: vi.fn((mode: RepeatMode) => {
    harness.scriptureRepeatMode = mode;
  }),
  setRepeatMode: vi.fn((mode: RepeatMode) => {
    harness.repeatMode = mode;
  }),
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
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    harness.memos[index] ??= { dependencies: [], value: { current: initial } };
    return harness.memos[index].value;
  },
  useState: (initial: unknown) => {
    const index = harness.stateCursor++;
    if (!(index in harness.states)) harness.states[index] = initial;
    return [
      harness.states[index],
      (next: unknown) => {
        harness.states[index] =
          typeof next === "function" ? next(harness.states[index]) : next;
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
  useAppStore: Object.assign(
    (select: (state: unknown) => unknown) => select(harness),
    {
      getState: () => harness,
      subscribe: () => () => {},
    },
  ),
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
  harness.repeatMode = "off";
  harness.scriptureRepeatMode = "off";
  harness.status.playing = false;
  harness.status.isBuffering = false;
  harness.status.isLoaded = true;
  harness.status.currentTime = 0;
  harness.status.didJustFinish = false;
  harness.status.error = null;
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
  audio.playQueue([verse], 0, "verse");
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  return status({ playing: true, currentTime: 9.9 });
}
it.each([true, false])(
  "keeps the new hymn pause control stable when switching from playing=%s",
  async (wasPlaying) => {
    const first = {
      ...verse,
      kind: "hymn" as const,
      startTime: undefined,
      endTime: undefined,
    };
    value().playQueue([first]);
    await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
    status({ playing: wasPlaying });
    let finishSeek!: () => void;
    harness.player.seekTo.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finishSeek = resolve;
        }),
    );
    value().playQueue([
      {
        ...first,
        id: "next-hymn",
        source: { uri: "https://example.test/next.mp3" },
      },
    ]);
    expect(value().track?.id).toBe("next-hymn");
    expect(value().playing).toBe(true);
    expect(status({ playing: false, isLoaded: false }).playing).toBe(true);
    await vi.waitFor(() => expect(finishSeek).toBeDefined());
    finishSeek();
    await vi.waitFor(() =>
      expect(harness.player.play).toHaveBeenCalledTimes(2),
    );
    expect(
      status({ playing: false, isBuffering: true, isLoaded: false }).playing,
    ).toBe(true);
    expect(
      status({ playing: true, isBuffering: false, isLoaded: true }).playing,
    ).toBe(true);
    expect(status({ playing: false }).playing).toBe(false);
  },
);

it("cancels a pending hymn immediately without restarting after its seek finishes", async () => {
  let finishSeek!: () => void;
  harness.player.seekTo.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishSeek = resolve;
      }),
  );
  value().playQueue([{ ...verse, kind: "hymn" }]);
  await vi.waitFor(() => expect(finishSeek).toBeDefined());
  value().toggle();
  expect(value().playing).toBe(false);
  expect(value().buffering).toBe(false);
  finishSeek();
  await Promise.resolve();
  expect(harness.player.play).not.toHaveBeenCalled();
});

it("ignores a queued ready pause after the newly selected source is already playing", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true });
  value().playQueue([{ ...verse, id: "same-source-next" }]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(2));
  Object.assign(harness.status, { playing: false, isLoaded: true });
  expect(harness.player.playing).toBe(true);
  harness.listener?.(harness.status);
  expect(value().playing).toBe(true);
  expect(status({ playing: true }).playing).toBe(true);
  expect(status({ playing: false }).playing).toBe(false);
});

it("publishes a user pause immediately before the native paused event arrives", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  const playing = status({ playing: true });
  playing.toggle();
  expect(value().playing).toBe(false);
});

it("reflects a native media stop after playback has started and can resume", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true });
  const stopped = status({
    playing: false,
    isLoaded: false,
    isBuffering: false,
  });
  expect(stopped.playing).toBe(false);
  stopped.toggle();
  expect(harness.player.play).toHaveBeenCalledTimes(2);
});

it("reflects a native media-control resume after an in-app pause", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true }).toggle();
  expect(status({ playing: false }).playing).toBe(false);
  const resumed = status({ playing: true });
  expect(resumed.playing).toBe(true);
  resumed.toggle();
  expect(harness.player.play).toHaveBeenCalledOnce();
  expect(value().playing).toBe(false);
});

it("clears the loading control when source preparation fails without another native event", async () => {
  harness.player.seekTo.mockRejectedValueOnce(new Error("Cannot load source"));
  value().playQueue([verse]);
  expect(value().buffering).toBe(true);
  await vi.waitFor(() => expect(harness.notify).toHaveBeenCalled());
  expect(value().playing).toBe(false);
  expect(value().buffering).toBe(false);
});

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
it("retries the selected chapter through the play control after a native source error", async () => {
  const audio = value();
  audio.playQueue([
    {
      ...verse,
      id: "leviticus-1",
      source: { uri: "https://example.test/leviticus1.mp3" },
    },
  ]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true, currentTime: 90 });
  audio.playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(2));
  const failed = status({
    playing: false,
    currentTime: 6,
    error: "Source error",
  });
  expect(failed.playing).toBe(false);
  expect(failed.buffering).toBe(false);
  expect(failed.track).toEqual(verse);
  failed.toggle();
  await vi.waitFor(() =>
    expect(harness.player.replace).toHaveBeenCalledTimes(3),
  );
  expect(harness.player.seekTo).toHaveBeenLastCalledWith(6, 0, 0);
  expect(harness.player.play).toHaveBeenCalledTimes(3);
  expect(status({ playing: true, error: null }).playing).toBe(true);
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
it("publishes playback and buffering changes immediately", async () => {
  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  const initial = status({ playing: false });
  const playing = status({ playing: true });
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

it.each(["off", "verse", "chapter"] as const)(
  "starts the player with the saved %s repeat mode",
  async (mode) => {
    harness.repeatMode = mode;
    const audio = value();
    expect(audio.repeat).toBe(mode);
    audio.playQueue([
      { ...verse, kind: "hymn", startTime: undefined, endTime: undefined },
    ]);
    await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
    const { configurePlayer } =
      await import("../src/features/audio/audio-engine");
    expect(configurePlayer).toHaveBeenLastCalledWith(
      harness.player,
      expect.objectContaining({ loop: mode === "verse" }),
    );
  },
);

it("uses the saved Scripture mode when starting new verses, independently of hymns", async () => {
  harness.scriptureRepeatMode = "verse";
  const hymn = { ...verse, kind: "hymn" as const, startTime: undefined, endTime: undefined };
  value().playQueue([hymn]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(1));
  expect(value().repeat).toBe("off");

  value().playQueue([verse]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(2));
  expect(value().repeat).toBe("verse");

  value().playQueue([
    {
      ...verse,
      id: "whole-chapter",
      verse: undefined,
      startTime: undefined,
      endTime: undefined,
      timingQuality: "unaligned",
    },
  ]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(3));
  expect(value().repeat).toBe("off");
  expect(harness.scriptureRepeatMode).toBe("verse");

  value().playQueue([{ ...verse, id: "next-verse", verse: 2 }]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(4));
  expect(value().repeat).toBe("verse");
});

it("saves repeat changes made through the player control", () => {
  const audio = value();
  audio.setRepeat("chapter");
  expect(harness.setRepeatMode).toHaveBeenCalledWith("chapter");
  expect(value().repeat).toBe("chapter");
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
    { showNextTrack: false, showPreviousTrack: true },
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

const hymn: AudioTrack = {
  ...verse,
  id: "hymn-current-lyric",
  kind: "hymn",
  title: "当前歌词测试",
  startTime: undefined,
  endTime: undefined,
  lyrics: "[00:02]第一句\n[00:05]第二句\n[00:08]\n[00:12]最后一句",
};

async function startHymn() {
  harness.platform.OS = "android";
  value().playQueue([hymn]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  value();
  await vi.waitFor(() =>
    expect(harness.player.updateLockScreenMetadata).toHaveBeenCalled(),
  );
}

it("publishes the current timed lyric below the song title on native media controls", async () => {
  await startHymn();
  status({ playing: true, currentTime: 2 });
  expect(harness.player.updateLockScreenMetadata).toHaveBeenLastCalledWith({
    title: hymn.title,
    artist: "第一句",
    albumTitle: "Hymns",
    artworkUrl: "file:///cache/morning.jpg",
  });
});

it("updates media lyrics only at line changes without reloading artwork or reactivating the session", async () => {
  await startHymn();
  const initial = status({ playing: true, currentTime: 2 });
  const updates = harness.player.updateLockScreenMetadata.mock.calls.length;
  const activations = harness.player.setActiveForLockScreen.mock.calls.length;
  for (const currentTime of [2.1, 3, 4.9])
    expect(status({ currentTime })).toBe(initial);
  expect(harness.player.updateLockScreenMetadata).toHaveBeenCalledTimes(
    updates,
  );
  expect(status({ currentTime: 5 })).toBe(initial);
  expect(harness.player.updateLockScreenMetadata).toHaveBeenCalledTimes(
    updates + 1,
  );
  expect(
    harness.player.updateLockScreenMetadata.mock.lastCall?.[0].artist,
  ).toBe("第二句");
  expect(harness.player.setActiveForLockScreen).toHaveBeenCalledTimes(
    activations,
  );
  expect(harness.loadArtwork).toHaveBeenCalledOnce();
});

it("follows backward seeks while paused and clears the previous lyric during instrumental gaps", async () => {
  await startHymn();
  status({ playing: true, currentTime: 5 });
  status({ playing: false, currentTime: 5 });
  expect(
    harness.player.updateLockScreenMetadata.mock.lastCall?.[0].artist,
  ).toBe("第二句");
  status({ currentTime: 2 });
  expect(
    harness.player.updateLockScreenMetadata.mock.lastCall?.[0].artist,
  ).toBe("第一句");
  status({ currentTime: 8 });
  expect(
    harness.player.updateLockScreenMetadata.mock.lastCall?.[0].artist,
  ).toBe("Selah · 息语");
  status({ currentTime: 0 });
  expect(
    harness.player.updateLockScreenMetadata.mock.lastCall?.[0].artist,
  ).toBe("Selah · 息语");
});

it("keeps the newest lyric when the cover finishes loading later", async () => {
  harness.platform.OS = "android";
  let finishCover!: (assets: { localUri: string; uri: string }[]) => void;
  harness.loadArtwork.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCover = resolve;
      }),
  );
  value().playQueue([hymn]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  status({ playing: true, currentTime: 5 });
  finishCover([{ localUri: "file:///cache/late.jpg", uri: "" }]);
  await vi.waitFor(() =>
    expect(harness.player.updateLockScreenMetadata).toHaveBeenLastCalledWith({
      title: hymn.title,
      artist: "第二句",
      albumTitle: "Hymns",
      artworkUrl: "file:///cache/late.jpg",
    }),
  );
});

it("does not carry lyrics into a different track or guess timing for plain text", async () => {
  await startHymn();
  const audio = status({ playing: true, currentTime: 5 });
  audio.playQueue([
    { ...hymn, id: "plain", title: "无时间轴", lyrics: "纯文本歌词" },
  ]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledTimes(2));
  status({ currentTime: 15 });
  await vi.waitFor(() =>
    expect(harness.player.updateLockScreenMetadata).toHaveBeenLastCalledWith(
      expect.objectContaining({
        title: "无时间轴",
        artist: "Selah · 息语",
      }),
    ),
  );
});

// Native update/version and persistence ports stay outside provider behavior tests.
vi.mock("../src/data/update-artifact", () => ({
  createUpdateArtifactPort: () => ({ installed: () => ({ buildNumber: 1 }) }),
}));
vi.mock("../src/data/playback-checkpoint-storage", () => ({
  playbackCheckpointStorage: {
    read: async () => null,
    write: async () => {},
    clear: async () => {},
  },
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymnCatalog: () => ({ tracks: [], status: "ready" }),
}));

it("records a published hymn in history only after the player confirms playback", async () => {
  const published = {
    ...hymn,
    hymn: {
      id: hymn.id,
      titleZh: hymn.title,
      titleEn: "Test hymn",
      subtitleZh: "合唱团",
      subtitleEn: "Choir",
      duration: 100,
      audioPath: "/fixture.mp3",
      enabled: true,
    },
  };
  value().playQueue([published]);
  await vi.waitFor(() => expect(harness.player.play).toHaveBeenCalledOnce());
  value();
  expect(harness.rememberHymn).not.toHaveBeenCalled();
  status({ playing: true, currentTime: 0.2 });
  status({ currentTime: 0.4 });
  expect(harness.rememberHymn).toHaveBeenCalledExactlyOnceWith(published);
});
