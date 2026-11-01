import { expect, it, vi } from "vitest";
import { AudioSession } from "../src/domain/audio-session";
import { recordingAudioItems } from "../src/domain/scripture-audio";
import { offlineChapters } from "../src/data/offline-catalog";
import type { AudioTrack, ChapterRecording } from "../src/domain/models";
import type { AudioPlayer } from "expo-audio";
import { RangePlayback } from "../src/features/audio/range-playback";

const path = `/api/audio/resources/${"a".repeat(64)}.mp3`;
const recording: ChapterRecording = {
  path,
  duration: 30,
  segments: [],
  alignmentStatus: "partial",
  missingVerses: [{ verse: 2, reason: "not-narrated-in-source" }],
  verseFiles: [
    {
      verse: 1,
      path: "/verse1.mp3",
      duration: 6,
      sourceStart: 4,
      sourceEnd: 10,
    },
    {
      verse: 3,
      path: "/verse3.mp3",
      duration: 6,
      sourceStart: 12,
      sourceEnd: 18,
    },
  ],
};
it("uses the original chapter and verified cut offsets for every playable verse", () => {
  expect(recordingAudioItems(recording)).toMatchObject([
    { verse: 1, path, startTime: 4, endTime: 10, duration: 6 },
    { verse: 3, path, startTime: 12, endTime: 18, duration: 6 },
  ]);
});
it("does not invent a chapter position for missing or invalid cut offsets", () => {
  expect(
    recordingAudioItems({
      ...recording,
      verseFiles: [
        { verse: 1, path: "/1.mp3", duration: 6 },
        {
          verse: 3,
          path: "/3.mp3",
          duration: 6,
          sourceStart: 12,
          sourceEnd: 40,
        },
      ],
    }),
  ).toEqual([]);
});
it("downloads only the chapter while keeping the full verified timing snapshot", () => {
  const [chapter] = offlineChapters(
    { kind: "chapter", bookId: "john", chapter: 1 },
    "en",
    {
      version: 1,
      recordings: { "john:1:en": recording },
      files: [{ path, size: 100, sha256: "a".repeat(64) }],
    },
  );
  expect(chapter.files).toHaveLength(1);
  expect(chapter.recording).toEqual(recording);
});
it("delegates verse boundaries to the native engine without a JavaScript replay", async () => {
  const port = {
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    configure: vi.fn(),
    currentTime: 5.5,
    handlesLoopRange: true,
    setLoopRange: vi.fn(
      async (_range: { startTime: number; endTime: number } | null) => {},
    ),
  };
  const track: AudioTrack = {
    id: "john-1-1-en",
    title: "John 1:1",
    subtitle: "",
    artwork: 1,
    kind: "scripture",
    source: { uri: path },
    startTime: 4,
    endTime: 10,
    duration: 6,
  };
  const error = vi.fn();
  const session = new AudioSession(port, vi.fn(), error);
  session.configure({ repeat: "verse" });
  await session.playQueue([track]);
  expect(port.setLoopRange).toHaveBeenLastCalledWith({
    startTime: 4,
    endTime: 10,
  });
  await session.onStatus({
    currentTime: 10,
    playing: true,
    didJustFinish: true,
  });
  expect(port.seekTo).toHaveBeenCalledExactlyOnceWith(4);
  expect(port.play).toHaveBeenCalledOnce();
  session.pause();
  port.currentTime = 5.5;
  session.configure({ repeat: "off" });
  await vi.waitFor(() =>
    expect(port.setLoopRange).toHaveBeenLastCalledWith(null),
  );
  expect(port.replace).toHaveBeenCalledOnce();
  expect(port.seekTo).toHaveBeenLastCalledWith(5.5);
  expect(port.play).toHaveBeenCalledOnce();
  expect(error).not.toHaveBeenCalled();
});

it("waits for a pending native range origin when resuming the same verse", async () => {
  let finish!: () => void;
  let origin = 0;
  const seeks: number[] = [];
  const port = {
    replace() {},
    play: vi.fn(),
    pause() {},
    configure() {},
    currentTime: 0,
    handlesLoopRange: true,
    async seekTo(time: number) {
      seeks.push(time - origin);
    },
    setLoopRange: vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            origin = 4;
            resolve();
          };
        }),
    ),
  };
  const session = new AudioSession(port, vi.fn(), vi.fn());
  session.configure({ repeat: "verse" });
  const pending = session.playQueue([
    {
      id: "verse",
      title: "Verse",
      subtitle: "",
      kind: "scripture",
      artwork: 1,
      source: { uri: path },
      startTime: 4,
      endTime: 10,
    },
  ]);
  session.pause();
  const resumed = session.resume();
  expect(seeks).toEqual([]);
  finish();
  await Promise.all([pending, resumed]);
  expect(seeks).toEqual([0]);
  expect(port.play).toHaveBeenCalledOnce();
});

it("restores whole-file repetition after selecting the same chapter without a verse range", async () => {
  const player = {
    currentTime: 0,
    loop: false,
    replace() {},
    play() {},
    pause() {},
    seekTo: async () => {},
    setPlaybackRate() {},
    volume: 0.8,
  };
  const backend = {
    async setRange(_player: AudioPlayer, start: number | null) {
      player.loop = start !== null;
      return start ?? 0;
    },
    setPlaying() {},
  };
  const port = new RangePlayback(player as unknown as AudioPlayer, backend);
  const session = new AudioSession(port, vi.fn(), vi.fn());
  const track: AudioTrack = {
    id: "verse",
    kind: "scripture",
    title: "Verse",
    subtitle: "",
    artwork: 1,
    source: { uri: path },
    startTime: 4,
    endTime: 10,
  };
  session.configure({ repeat: "verse" });
  await session.playQueue([track]);
  await session.playQueue([
    { ...track, startTime: undefined, endTime: undefined },
  ]);
  expect(player.loop).toBe(true);
});

it("keeps playback intent when disabling repetition during a native EOF rewind", async () => {
  const port = {
    replace() {},
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause() {},
    configure() {},
    currentTime: 10,
    handlesLoopRange: true,
    setLoopRange: async () => {},
  };
  const session = new AudioSession(port, vi.fn(), vi.fn());
  session.configure({ repeat: "verse" });
  await session.playQueue([
    {
      id: "verse",
      title: "Verse",
      subtitle: "",
      artwork: 1,
      kind: "scripture",
      source: { uri: path },
      startTime: 4,
      endTime: 10,
    },
  ]);
  await session.onStatus({
    playing: false,
    currentTime: 30,
    didJustFinish: true,
  });
  session.configure({ repeat: "off" });
  await vi.waitFor(() => expect(port.play).toHaveBeenCalledTimes(2));
  expect(port.seekTo).toHaveBeenLastCalledWith(10);
});
