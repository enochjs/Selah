import { expect, it, vi } from "vitest";
import type { AudioPlayer } from "expo-audio";
import {
  RangePlayback,
  type RangeBackend,
} from "../src/features/audio/range-playback";

function setup() {
  const player = {
    currentTime: 1.5,
    loop: false,
    volume: 0.8,
    replace: vi.fn(),
    seekTo: vi.fn(async () => {}),
    play: vi.fn(),
    pause: vi.fn(),
    setPlaybackRate: vi.fn(),
  };
  const backend: RangeBackend = {
    setRange: vi.fn(async (_player, start) => start ?? 0),
    setPlaying: vi.fn(),
  };
  const playback = new RangePlayback(player as unknown as AudioPlayer, backend);
  return { player, backend, playback };
}
it("maps a clipped native clock and seeks to original chapter seconds", async () => {
  const { player, playback } = setup();
  await playback.setLoopRange({ startTime: 24.781, endTime: 36.839 });
  expect(playback.currentTime).toBeCloseTo(26.281);
  expect(
    playback.status({ playing: true, currentTime: 2 }).currentTime,
  ).toBeCloseTo(26.781);
  await playback.seekTo(29.781);
  expect(player.seekTo).toHaveBeenLastCalledWith(5, 0, 0);
  await playback.setLoopRange(null);
  expect(playback.currentTime).toBe(1.5);
  await playback.seekTo(29.781);
  expect(player.seekTo).toHaveBeenLastCalledWith(29.781, 0, 0);
});
it("keeps engine range repetition enabled across volume and speed changes", async () => {
  const { player, playback } = setup();
  await playback.setLoopRange({ startTime: 4, endTime: 10 });
  player.loop = true;
  playback.configure({ loop: false, volume: 0.4, rate: 1.5 });
  expect(player.loop).toBe(true);
  expect(player.volume).toBe(0.4);
  expect(player.setPlaybackRate).toHaveBeenLastCalledWith(1.5);
});
it("does not apply a stale range origin after clearing the range", async () => {
  const { player, backend, playback } = setup();
  let finish!: (origin: number) => void;
  vi.mocked(backend.setRange).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const pending = playback.setLoopRange({ startTime: 4, endTime: 10 });
  await playback.setLoopRange(null);
  finish(4);
  await pending;
  expect(playback.currentTime).toBe(player.currentTime);
});
