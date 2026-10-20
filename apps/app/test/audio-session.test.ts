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
} as AudioTrack;
const second = {
  ...first,
  id: "john-1-2",
  title: "John 1:2",
  startTime: 10,
  endTime: 16,
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
