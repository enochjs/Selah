import React from "react";
import { beforeEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  cursor: 0,
  stateCursor: 0,
  states: [] as unknown[],
  memos: [] as { dependencies: unknown[]; value: unknown }[],
  status: {
    playing: false,
    isBuffering: false,
    didJustFinish: false,
    currentTime: 0,
    duration: 100,
  },
  player: { currentTime: 0, playing: false },
  notify: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: () => {},
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
    return [harness.states[index], vi.fn()];
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
vi.mock("react-native", () => ({ Platform: { OS: "web" } }));
vi.mock("expo-audio", () => ({
  useAudioPlayer: () => harness.player,
  useAudioPlayerStatus: () => harness.status,
  setAudioModeAsync: vi.fn(),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: () => harness.notify,
}));
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
  downloadManager: { resolveSource: vi.fn() },
}));
import { AudioProvider } from "../src/features/audio/AudioProvider";

function value() {
  harness.cursor = 0;
  harness.stateCursor = 0;
  return AudioProvider({ children: null }).props.value;
}
beforeEach(() => {
  harness.memos = [];
  harness.states = [];
  harness.status.playing = false;
  harness.status.isBuffering = false;
  harness.status.currentTime = 0;
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
