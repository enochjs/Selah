import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack, ChapterRecording } from "../src/domain/models";

const context = vi.hoisted(() => ({
  state: { bookId: "john", chapter: 1, selectedVerse: 2, primaryLocale: "en" },
  subscribe: null as
    | null
    | ((
        state: { primaryLocale: string },
        previous: { primaryLocale: string },
      ) => void),
  notify: vi.fn(),
  recording: null as ChapterRecording | null,
  tracks: [] as AudioTrack[],
  player: {
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    setActiveForLockScreen: vi.fn(),
    addListener: vi.fn(() => ({ remove() {} })),
    currentTime: 0,
    playing: false,
  },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (effect: () => unknown) => effect(),
}));
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-asset", () => ({ Asset: { loadAsync: vi.fn() } }));
vi.mock("expo-audio", () => ({
  useAudioPlayer: () => context.player,
  useAudioPlayerStatus: () => ({
    playing: false,
    currentTime: 0,
    duration: 20,
  }),
  setAudioModeAsync: async () => {},
}));
vi.mock("../src/features/audio/audio-engine", () => ({
  configurePlayer: () => {},
}));
vi.mock("../src/features/audio/catalog", () => ({
  chapterTracks: () => context.tracks,
}));
vi.mock("../src/data/audio-repository", () => ({
  getChapterRecording: () => context.recording,
}));
vi.mock("../src/config/resources", () => ({
  resourceServerUrl: () => "https://example.test",
}));
vi.mock("../src/data/resource-info", () => ({ englishVersion: "NIV" }));
vi.mock("../src/data/offline-audio-runtime", () => ({
  downloadManager: { resolveSource: async (source: unknown) => source },
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(
    (select: (state: unknown) => unknown) =>
      select({
        ...context.state,
        notify: context.notify,
        repeatMode: "off",
        setRepeatMode: vi.fn(),
      }),
    {
      getState: () => context.state,
      subscribe: (callback: typeof context.subscribe) => {
        context.subscribe = callback;
        return () => {};
      },
    },
  ),
}));
import { AudioProvider, useAudio } from "../src/features/audio/AudioProvider";
let audio: ReturnType<typeof useAudio>;
function Probe({ children }: PropsWithChildren) {
  audio = useAudio();
  return children;
}
const verse = {
  id: "john-1-1-en",
  title: "John 1:1",
  subtitle: "",
  kind: "scripture",
  artwork: 1,
  source: { uri: "https://example.test/verse1.mp3" },
  bookId: "john",
  chapter: 1,
  verse: 1,
  locale: "en",
} satisfies AudioTrack;
beforeEach(() => {
  vi.clearAllMocks();
  context.state.primaryLocale = "en";
  context.recording = {
    alignmentStatus: "partial",
    path: "/chapter.mp3",
    duration: 20,
    segments: [],
    missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
  };
  context.tracks = [verse, { ...verse, id: "verse3", verse: 3 }];
  renderToStaticMarkup(
    React.createElement(AudioProvider, null, React.createElement(Probe)),
  );
});
it("never starts the first verse when the selected verse is explicitly missing", () => {
  audio.toggle();
  expect(context.notify).toHaveBeenCalledWith(
    expect.stringContaining("not narrated"),
  );
  expect(context.player.seekTo).not.toHaveBeenCalled();
  expect(context.player.play).not.toHaveBeenCalled();
});
it("pauses and explains confirmed missing source narration when changing language", async () => {
  audio.playQueue([{ ...verse, verse: 2 }]);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  context.state.primaryLocale = "zh";
  context.subscribe?.({ primaryLocale: "zh" }, { primaryLocale: "en" });
  await vi.waitFor(() =>
    expect(context.notify).toHaveBeenCalledWith(
      expect.stringContaining("not narrated"),
    ),
  );
  expect(context.player.play).toHaveBeenCalledOnce();
  expect(context.player.seekTo).toHaveBeenCalledOnce();
});
