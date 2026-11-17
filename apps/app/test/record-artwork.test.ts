import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
  phase: 0,
  reducedMotion: false,
  motion: undefined as undefined | ((value: boolean) => void),
  appState: undefined as undefined | ((value: string) => void),
  finish: undefined as undefined | ((result: { finished: boolean }) => void),
  timing: vi.fn(),
  stop: vi.fn(),
  remove: vi.fn(),
  source: undefined as unknown,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = h.cursor++;
    if (!(index in h.cells))
      h.cells[index] = typeof initial === "function" ? initial() : initial;
    return [
      h.cells[index],
      (value: unknown) => {
        h.cells[index] = value;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = h.cursor++;
    const old = h.cells[index] as
      { deps: unknown[]; cleanup?: () => void } | undefined;
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i])))
      h.effects.push(() => {
        old?.cleanup?.();
        h.cells[index] = { deps, cleanup: effect() || undefined };
      });
  },
}));
function container({ children }: PropsWithChildren) {
  return React.createElement("div", null, children);
}
vi.mock("react-native", () => ({
  View: container,
  Image: ({ source }: { source: unknown }) => {
    h.source = source;
    return null;
  },
  Platform: { OS: "android" },
  Easing: { linear: () => {} },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => h.reducedMotion,
    addEventListener: (_: string, listener: (value: boolean) => void) => {
      h.motion = listener;
      return { remove: h.remove };
    },
  },
  AppState: {
    currentState: "active",
    addEventListener: (_: string, listener: (value: string) => void) => {
      h.appState = listener;
      return { remove: h.remove };
    },
  },
  Animated: {
    View: container,
    Value: class {
      setValue(value: number) {
        h.phase = value;
      }
      stopAnimation(callback?: (value: number) => void) {
        callback?.(h.phase);
      }
      interpolate() {
        return "rotation";
      }
    },
    timing: (_: unknown, config: unknown) => {
      h.timing(config);
      return {
        start: (callback: typeof h.finish) => {
          h.finish = callback;
        },
        stop: h.stop,
      };
    },
  },
}));
vi.mock("../src/shared/theme", () => ({ colors: {} }));
import { RecordArtwork } from "../src/features/audio/RecordArtwork";
function render(playing = true) {
  h.cursor = 0;
  renderToStaticMarkup(
    React.createElement(RecordArtwork, {
      source: 42,
      size: 40,
      playing,
    }),
  );
  h.effects.splice(0).forEach((effect) => effect());
}
async function mount(playing = true) {
  render(playing);
  await Promise.resolve();
  render(playing);
}
beforeEach(() => {
  h.cursor = 0;
  h.cells = [];
  h.effects = [];
  h.phase = 0;
  h.reducedMotion = false;
  vi.clearAllMocks();
});

it("rotates the actual artwork smoothly using the native driver only while playing", async () => {
  await mount(false);
  expect(h.source).toBe(42);
  expect(h.timing).not.toHaveBeenCalled();
  render();
  expect(h.timing).toHaveBeenCalledWith(
    expect.objectContaining({
      toValue: 1,
      duration: 18000,
      useNativeDriver: true,
      isInteraction: false,
    }),
  );
});

it("pauses at the current angle and resumes at the same speed without snapping back", async () => {
  await mount();
  h.phase = 0.25;
  render(false);
  expect(h.stop).toHaveBeenCalledOnce();
  expect(h.phase).toBe(0.25);
  render();
  expect(h.phase).toBe(0.25);
  expect(h.timing).toHaveBeenLastCalledWith(
    expect.objectContaining({ duration: 13500 }),
  );
  h.finish!({ finished: true });
  expect(h.phase).toBe(0);
  expect(h.timing).toHaveBeenLastCalledWith(
    expect.objectContaining({ duration: 18000 }),
  );
});

it("stops for reduced motion and the background, and removes subscriptions on unmount", async () => {
  await mount();
  h.motion!(true);
  render();
  expect(h.stop).toHaveBeenCalledTimes(1);
  h.motion!(false);
  render();
  h.appState!("background");
  render();
  expect(h.stop).toHaveBeenCalledTimes(2);
  h.appState!("active");
  render();
  for (const cell of h.cells) {
    const effect = cell as { cleanup?: () => void } | undefined;
    effect?.cleanup?.();
  }
  expect(h.stop).toHaveBeenCalledTimes(3);
  expect(h.remove).toHaveBeenCalledTimes(2);
});

it("never starts the decoration when reduced motion is already enabled", async () => {
  h.reducedMotion = true;
  await mount();
  expect(h.timing).not.toHaveBeenCalled();
});
