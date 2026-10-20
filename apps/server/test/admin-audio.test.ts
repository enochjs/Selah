import { afterEach, expect, it, vi } from "vitest";
import { createAudioPreview } from "../public/audio-preview.js";

function media() {
  const audio = {
    src: "",
    currentTime: 0,
    readyState: 1,
    onloadedmetadata: null as null | (() => void),
    onerror: null as null | (() => void),
    pause: vi.fn(),
    load: vi.fn(),
    play: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    getAttribute: () => audio.src,
    removeAttribute: () => {
      audio.src = "";
    },
  };
  return audio;
}
afterEach(() => vi.useRealTimers());
it("ignores a stale pending play when rapidly selecting another verse", async () => {
  vi.useFakeTimers();
  const audio = media();
  let finishFirst!: () => void;
  audio.src = "/test.mp3";
  audio.play.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishFirst = resolve;
      }),
  );
  const preview = createAudioPreview(audio);
  const first = preview.play({ path: "/test.mp3", start: 0, end: 10 });
  await preview.play({ path: "/test.mp3", start: 20, end: 30 });
  const pauses = audio.pause.mock.calls.length;
  finishFirst();
  await first;
  vi.advanceTimersByTime(100);
  expect(audio.pause).toHaveBeenCalledTimes(pauses);
  expect(vi.getTimerCount()).toBe(1);
  audio.currentTime = 30;
  vi.advanceTimersByTime(50);
  expect(audio.pause).toHaveBeenCalledTimes(pauses + 1);
  expect(vi.getTimerCount()).toBe(0);
  preview.dispose();
});
it("cancels playback after closing while play or metadata is pending", async () => {
  vi.useFakeTimers();
  const audio = media();
  const preview = createAudioPreview(audio);
  await preview.play({ path: "/other.mp3", start: 5, end: 10 });
  const loaded = audio.onloadedmetadata!;
  preview.dispose();
  loaded();
  expect(audio.play).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it("reports media errors and clears the verse timer", async () => {
  vi.useFakeTimers();
  const audio = media();
  audio.src = "/test.mp3";
  const onError = vi.fn();
  const preview = createAudioPreview(audio, onError);
  await preview.play({ path: "/test.mp3", start: 0, end: 10 });
  audio.onerror!();
  expect(onError).toHaveBeenCalledOnce();
  expect(vi.getTimerCount()).toBe(0);
  preview.dispose();
});
