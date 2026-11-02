import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";
import type { PlaybackStatus } from "../src/domain/audio-session";

const context = vi.hoisted(() => ({
  status: null as ((status: PlaybackStatus) => void) | null,
  notify: vi.fn(),
  chapterTracks:
    vi.fn<(bookId: string, chapter: number, locale: string) => AudioTrack[]>(),
  player: {
    currentTime: 0,
    playing: false,
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    addListener: vi.fn(
      (_event: string, listener: (status: PlaybackStatus) => void) => {
        context.status = listener;
        return { remove() {} };
      },
    ),
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
  useAudioPlayerStatus: () => ({ playing: false }),
  setAudioModeAsync: async () => {},
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(() => context.notify, {
    subscribe: () => () => {},
  }),
}));
vi.mock("../src/data/bible-repository", () => ({
  bibleRepository: {
    listBooks: () => [
      { id: "john", chapters: [[], []] },
      { id: "acts", chapters: [[]] },
    ],
  },
}));
vi.mock("../src/features/audio/catalog", () => ({
  chapterTracks: context.chapterTracks,
}));
vi.mock("../src/data/audio-repository", () => ({
  getChapterRecording: () => null,
}));
vi.mock("../src/features/audio/audio-engine", () => ({
  configurePlayer: vi.fn(),
}));
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
function tracks(bookId: string, chapter: number, locale = "en"): AudioTrack[] {
  return [1, 2].map((verse) => ({
    id: `${bookId}-${chapter}-${verse}-${locale}`,
    kind: "scripture",
    title: "Verse",
    subtitle: "",
    artwork: 1,
    bookId,
    chapter,
    verse,
    locale: locale as "en" | "zh",
    source: { uri: `https://example.test/${bookId}-${chapter}-${locale}.mp3` },
    startTime: verse === 1 ? 2 : 10,
    endTime: verse === 1 ? 10 : 20,
  }));
}
async function finish() {
  context.status?.({ currentTime: 22, playing: false, didJustFinish: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
}
beforeEach(() => {
  vi.clearAllMocks();
  context.chapterTracks.mockImplementation(tracks);
  renderToStaticMarkup(
    React.createElement(AudioProvider, null, React.createElement(Probe)),
  );
});

it("continues into the next chapter in the same narration after delayed EOF", async () => {
  audio.playQueue(tracks("john", 1, "zh"));
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  await finish();
  expect(context.chapterTracks).toHaveBeenCalledWith("john", 2, "zh");
  expect(context.player.replace).toHaveBeenLastCalledWith(
    tracks("john", 2, "zh")[0].source,
  );
  expect(context.player.seekTo).toHaveBeenLastCalledWith(2, 0, 0);
  expect(context.player.play).toHaveBeenCalledTimes(2);
  await finish();
  expect(context.chapterTracks).toHaveBeenLastCalledWith("acts", 1, "zh");
  expect(context.player.play).toHaveBeenCalledTimes(3);
});

it("lets the original chapter finish after the last verified verse boundary", async () => {
  audio.playQueue(tracks("john", 1));
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  context.status?.({ currentTime: 20, playing: true });
  expect(context.player.pause).toHaveBeenCalledOnce();
  expect(context.chapterTracks).not.toHaveBeenCalled();
  await finish();
  expect(context.player.play).toHaveBeenCalledTimes(2);
});

it("continues after chapter-only recordings without inventing verse timing", async () => {
  audio.playQueue([
    {
      ...tracks("john", 1)[0],
      verse: undefined,
      startTime: undefined,
      endTime: undefined,
    },
  ]);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  await finish();
  expect(context.chapterTracks).toHaveBeenCalledWith("john", 2, "en");
  expect(context.player.play).toHaveBeenCalledTimes(2);
});

it("stops at the end of the Bible without wrapping", async () => {
  audio.playQueue(tracks("acts", 1));
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  await finish();
  expect(context.chapterTracks).not.toHaveBeenCalled();
  expect(context.player.play).toHaveBeenCalledOnce();
});

it("stops and explains unavailable next-chapter audio without skipping ahead", async () => {
  context.chapterTracks.mockReturnValue([]);
  audio.playQueue(tracks("john", 1));
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  await finish();
  expect(context.chapterTracks).toHaveBeenCalledExactlyOnceWith(
    "john",
    2,
    "en",
  );
  expect(context.notify).toHaveBeenCalledWith(
    expect.stringContaining("Next chapter audio is unavailable"),
  );
  expect(context.player.play).toHaveBeenCalledOnce();
});

it.each(["chapter", "verse"] as const)(
  "preserves %s repetition instead of moving to the next chapter",
  async (repeat) => {
    audio.setRepeat(repeat);
    audio.playQueue(tracks("john", 1), 1);
    await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
    await finish();
    expect(context.chapterTracks).not.toHaveBeenCalled();
    expect(context.player.seekTo).toHaveBeenLastCalledWith(
      repeat === "chapter" ? 2 : 10,
      0,
      0,
    );
  },
);

it("keeps hymn queues independent of scripture continuation", async () => {
  audio.playQueue([{ ...tracks("john", 1)[0], kind: "hymn" }]);
  await vi.waitFor(() => expect(context.player.play).toHaveBeenCalledOnce());
  await finish();
  expect(context.chapterTracks).not.toHaveBeenCalled();
  expect(context.player.play).toHaveBeenCalledOnce();
});
