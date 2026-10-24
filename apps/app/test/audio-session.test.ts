import { it, expect, vi } from "vitest";
import { AudioSession } from "../src/domain/audio-session";
import type { AudioTrack } from "../src/domain/models";
const first = {
  id: "john-1-1",
  title: "John 1:1",
  subtitle: "",
  source: { uri: "https://example.test/John1.mp3" },
  kind: "scripture",
  artwork: 1,
  startTime: 4,
  endTime: 10,
  duration: 6,
} satisfies AudioTrack;
const second = {
  ...first,
  id: "john-1-2",
  title: "John 1:2",
  startTime: 10,
  endTime: 16,
};
const clippedFirst = {
  ...first,
  source: { uri: "https://example.test/John1-1.mp3" },
  startTime: undefined,
  endTime: undefined,
  chapterAudio: { source: first.source, startTime: 4, endTime: 10 },
};
const clippedSecond = {
  ...second,
  source: { uri: "https://example.test/John1-2.mp3" },
  startTime: undefined,
  endTime: undefined,
  chapterAudio: { source: first.source, startTime: 11, endTime: 16 },
};
function harness() {
  const port = {
    replace: vi.fn(),
    seekTo: vi.fn().mockResolvedValue(undefined),
    play: vi.fn(),
    pause: vi.fn(),
    configure: vi.fn(),
    currentTime: 0,
  };
  const changed = vi.fn(),
    error = vi.fn();
  return {
    port,
    changed,
    error,
    session: new AudioSession(port, changed, error),
  };
}
it("resolves chapter and verse files locally while preserving repeat switching and rate changes", async () => {
  const { port, changed, error } = harness();
  const resolve = vi.fn(async (source: AudioTrack["source"]) =>
    typeof source === "number"
      ? source
      : { uri: "file:///local/" + source.uri.split("/").pop() },
  );
  const session = new AudioSession(port, changed, error, resolve);
  await session.playQueue([clippedFirst, clippedSecond]);
  expect(port.replace).toHaveBeenLastCalledWith({
    uri: "file:///local/John1.mp3",
  });
  session.configure({ rate: 1.5 });
  expect(port.replace).toHaveBeenCalledTimes(1);
  session.configure({ repeat: "verse" });
  await vi.waitFor(() =>
    expect(port.replace).toHaveBeenLastCalledWith({
      uri: "file:///local/John1-1.mp3",
    }),
  );
  expect(error).not.toHaveBeenCalled();
});
it("ignores a local-source lookup that finishes after playback was paused", async () => {
  const { port, changed, error } = harness();
  let finish!: (source: AudioTrack["source"]) => void;
  const session = new AudioSession(
    port,
    changed,
    error,
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = session.playQueue([first]);
  session.pause();
  finish({ uri: "file:///local.mp3" });
  await pending;
  expect(port.play).not.toHaveBeenCalled();
  expect(port.replace).not.toHaveBeenCalled();
});
it("keeps offline chapter narration continuous across verse gaps without extra seeks", async () => {
  const { port, changed, error } = harness();
  const session = new AudioSession(port, changed, error, async () => ({
    uri: "file:///chapter.mp3",
  }));
  await session.playQueue([clippedFirst, clippedSecond]);
  await session.onStatus({ currentTime: 10.5, playing: true });
  expect(session.index).toBe(0);
  await session.onStatus({ currentTime: 11.1, playing: true });
  expect(session.index).toBe(1);
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.play).toHaveBeenCalledTimes(1);
  expect(session.playbackTrack?.source).toEqual({ uri: "file:///chapter.mp3" });
});
it("uses the latest repeat mode when a local lookup is still pending", async () => {
  const { port, changed, error } = harness();
  let finish!: (source: AudioTrack["source"]) => void;
  const resolver = vi
    .fn()
    .mockResolvedValueOnce({ uri: "file:///chapter.mp3" })
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    )
    .mockResolvedValue({ uri: "file:///chapter.mp3" });
  const session = new AudioSession(port, changed, error, resolver);
  await session.playQueue([clippedFirst, clippedSecond]);
  port.currentTime = 6;
  session.configure({ repeat: "verse" });
  session.configure({ repeat: "off" });
  finish({ uri: "file:///verse.mp3" });
  await Promise.resolve();
  await Promise.resolve();
  expect(port.replace).toHaveBeenLastCalledWith({ uri: "file:///chapter.mp3" });
  expect(session.playbackTrack?.source).toEqual({ uri: "file:///chapter.mp3" });
});
it("resolves the selected source again when resuming a paused pending lookup", async () => {
  const { port, changed, error } = harness();
  const finishes: ((source: AudioTrack["source"]) => void)[] = [];
  const session = new AudioSession(
    port,
    changed,
    error,
    () =>
      new Promise((resolve) => {
        finishes.push(resolve);
      }),
  );
  const firstSelection = session.playQueue([first]);
  session.pause();
  const resumed = session.resume();
  finishes[0]({ uri: "file:///obsolete.mp3" });
  await firstSelection;
  expect(port.play).not.toHaveBeenCalled();
  expect(finishes).toHaveLength(2);
  finishes[1]({ uri: "file:///current.mp3" });
  await resumed;
  expect(port.replace).toHaveBeenLastCalledWith({ uri: "file:///current.mp3" });
  expect(port.play).toHaveBeenCalledOnce();
});
it("seeks to the verse before playing and reapplies settings", async () => {
  const { port, session } = harness();
  session.configure({ volume: 0.2 });
  await session.playQueue([first, second]);
  expect(port.seekTo).toHaveBeenCalledWith(4);
  expect(port.play).toHaveBeenCalledOnce();
  expect(port.configure).toHaveBeenLastCalledWith({
    volume: 0.2,
    rate: 1,
    loop: false,
  });
});
it("next verse reuses the chapter MP3 and seeks to its start", async () => {
  const { port, session } = harness();
  await session.playQueue([first, second]);
  await session.next();
  expect(port.replace).toHaveBeenCalledTimes(1);
  expect(port.seekTo).toHaveBeenLastCalledWith(10);
});
it("verse repeat seeks within the MP3 at the end boundary", async () => {
  const { port, session } = harness();
  session.configure({ repeat: "verse" });
  await session.playQueue([first, second]);
  await session.onStatus({ currentTime: 10, playing: true });
  expect(session.index).toBe(0);
  expect(port.seekTo).toHaveBeenLastCalledWith(4);
});
it("loops an isolated verse natively without a delayed JavaScript seek", async () => {
  const { port, session } = harness();
  const isolated = {
    ...first,
    source: { uri: "https://example.test/Psalm23-4.mp3" },
    startTime: undefined,
    endTime: undefined,
    duration: 11.899,
  };
  session.configure({ repeat: "verse" });
  await session.playQueue([isolated]);
  expect(port.configure).toHaveBeenLastCalledWith({
    volume: 0.8,
    rate: 1,
    loop: true,
  });
  await session.onStatus({
    currentTime: isolated.duration,
    playing: true,
    didJustFinish: true,
  });
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.pause).toHaveBeenCalledTimes(1);
});
it("a paused or stale status cannot advance the queue", async () => {
  const { session } = harness();
  await session.playQueue([first, second]);
  await session.onStatus({ currentTime: 10, playing: false });
  expect(session.index).toBe(0);
});
it("chapter repeat returns to the first verse", async () => {
  const { port, session } = harness();
  session.configure({ repeat: "chapter" });
  await session.playQueue([first, second], 1);
  await session.onStatus({ currentTime: 16, playing: true });
  expect(session.index).toBe(0);
  expect(port.seekTo).toHaveBeenLastCalledWith(4);
});
it("late seeks cannot restart an obsolete playback request", async () => {
  const { port, session } = harness();
  let resolve!: () => void;
  port.seekTo.mockImplementationOnce(
    () =>
      new Promise<void>((r) => {
        resolve = r;
      }),
  );
  const pending = session.playQueue([first, second]);
  await session.playQueue([first, second], 1);
  resolve();
  await pending;
  expect(port.play).toHaveBeenCalledTimes(1);
  expect(session.index).toBe(1);
});
it("progress seeking is relative to the active verse and clamped", async () => {
  const { port, session } = harness();
  await session.playQueue([first, second]);
  await session.seek(2);
  expect(port.seekTo).toHaveBeenLastCalledWith(6);
  await session.seek(99);
  expect(port.seekTo).toHaveBeenLastCalledWith(10);
});
it("continuous chapter playback crosses verse boundaries without interrupting the recording", async () => {
  const { port, session } = harness();
  await session.playQueue([first, second]);
  await session.onStatus({ currentTime: 10.1, playing: true });
  expect(session.index).toBe(1);
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.pause).toHaveBeenCalledTimes(1);
});
it("streams the original chapter across isolated verse boundaries without reloading or seeking", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  expect(port.replace).toHaveBeenCalledExactlyOnceWith(first.source);
  expect(port.seekTo).toHaveBeenCalledExactlyOnceWith(4);
  await session.onStatus({ currentTime: 10.5, playing: true });
  expect(session.index).toBe(0);
  await session.onStatus({ currentTime: 11.1, playing: true });
  expect(session.index).toBe(1);
  expect(port.replace).toHaveBeenCalledTimes(1);
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.pause).toHaveBeenCalledTimes(1);
  expect(port.play).toHaveBeenCalledTimes(1);
});
it("switches between chapter streaming and native verse looping at the same spoken position", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  port.currentTime = 5.5;
  session.configure({ repeat: "verse" });
  await Promise.resolve();
  expect(port.replace).toHaveBeenLastCalledWith(clippedFirst.source);
  expect(port.seekTo).toHaveBeenLastCalledWith(1.5);
  expect(port.configure).toHaveBeenLastCalledWith({
    volume: 0.8,
    rate: 1,
    loop: true,
  });
  port.currentTime = 1.5;
  session.configure({ repeat: "off" });
  await Promise.resolve();
  expect(port.replace).toHaveBeenLastCalledWith(first.source);
  expect(port.seekTo).toHaveBeenLastCalledWith(5.5);
  expect(port.configure).toHaveBeenLastCalledWith({
    volume: 0.8,
    rate: 1,
    loop: false,
  });
});
it("preserves pause when changing between verse looping and chapter playback", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  session.pause();
  port.currentTime = 6;
  session.configure({ repeat: "verse" });
  await Promise.resolve();
  expect(port.seekTo).toHaveBeenLastCalledWith(2);
  expect(port.play).toHaveBeenCalledTimes(1);
});
it("resumes the original recording during its natural breath without restarting the verse", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  port.currentTime = 10.5;
  session.pause();
  await session.resume();
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.play).toHaveBeenCalledTimes(2);
});
it("does not restart audio after a native interruption when changing repeat mode", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  port.currentTime = 6;
  await session.onStatus({ currentTime: 6, playing: false });
  session.configure({ repeat: "verse" });
  await Promise.resolve();
  expect(port.play).toHaveBeenCalledTimes(1);
});
it("queued playing statuses cannot undo an explicit pause", async () => {
  const { port, session } = harness();
  session.configure({ repeat: "verse" });
  await session.playQueue([first, second]);
  session.pause();
  await session.onStatus({ currentTime: 10, playing: true });
  expect(port.play).toHaveBeenCalledTimes(1);
});
it("unbounded recordings rewind on resume after finishing", async () => {
  const { port, session } = harness();
  const hymn = {
    ...first,
    kind: "hymn",
    startTime: undefined,
    endTime: undefined,
    duration: 6,
  } as AudioTrack;
  await session.playQueue([hymn]);
  await session.onStatus({
    currentTime: 6,
    playing: false,
    didJustFinish: true,
  });
  await session.resume();
  expect(port.seekTo).toHaveBeenCalledTimes(2);
  expect(port.seekTo).toHaveBeenLastCalledWith(0);
});
const threeVerses = [0, 1, 2].map((index) => ({
  ...first,
  id: `verse-${index}`,
  startTime: index * 10,
  endTime: (index + 1) * 10,
}));
it("catches up across multiple verse boundaries after a delayed status without seeking", async () => {
  const { port, session } = harness();
  await session.playQueue(threeVerses);
  await session.onStatus({ currentTime: 25, playing: true });
  expect(session.index).toBe(2);
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.pause).toHaveBeenCalledTimes(1);
});
it("stops at chapter EOF after a delayed completion without replaying earlier verses", async () => {
  const { port, session } = harness();
  await session.playQueue(threeVerses);
  await session.onStatus({
    currentTime: 30,
    playing: false,
    didJustFinish: true,
  });
  expect(session.index).toBe(2);
  expect(port.seekTo).toHaveBeenCalledTimes(1);
  expect(port.play).toHaveBeenCalledTimes(1);
});
it("repeats from the first verse at chapter EOF after a delayed completion", async () => {
  const { port, session } = harness();
  session.configure({ repeat: "chapter" });
  await session.playQueue(threeVerses);
  await session.onStatus({
    currentTime: 30,
    playing: false,
    didJustFinish: true,
  });
  expect(session.index).toBe(0);
  expect(port.seekTo).toHaveBeenLastCalledWith(0);
});
it("preserves the spoken position during rapid repeat changes with a pending source seek", async () => {
  const { port, session } = harness();
  await session.playQueue([clippedFirst, clippedSecond]);
  port.currentTime = 6;
  let complete!: () => void;
  port.replace.mockImplementation(() => {
    port.currentTime = 0;
  });
  port.seekTo.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  session.configure({ repeat: "verse" });
  session.configure({ repeat: "off" });
  await Promise.resolve();
  expect(port.seekTo).toHaveBeenLastCalledWith(6);
  complete();
  await Promise.resolve();
  expect(port.play).toHaveBeenCalledTimes(2);
});
