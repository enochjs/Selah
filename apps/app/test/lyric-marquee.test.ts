import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { LayoutChangeEvent } from "react-native";
const h = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
  cleanups: [] as (() => void)[],
  layouts: [] as ((e: LayoutChangeEvent) => void)[],
  motion: undefined as undefined | ((value: boolean) => void),
  appState: undefined as undefined | ((value: string) => void),
  start: vi.fn(),
  stop: vi.fn(),
  reset: vi.fn(),
  timing: vi.fn(),
  remove: vi.fn(),
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
    if (!old || deps.some((value, i) => !Object.is(value, old.deps[i]))) {
      h.effects.push(() => {
        old?.cleanup?.();
        const cleanup = effect() || undefined;
        h.cells[index] = { deps, cleanup };
        if (cleanup) h.cleanups.push(cleanup);
      });
    }
  },
}));
function container({
  children,
  onLayout,
}: PropsWithChildren<{ onLayout?: (e: LayoutChangeEvent) => void }>) {
  if (onLayout) h.layouts.push(onLayout);
  return React.createElement("div", null, children);
}
vi.mock("react-native", () => ({
  View: container,
  ScrollView: container,
  Platform: { OS: "android" },
  Easing: { linear: () => {} },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
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
      setValue = h.reset;
    },
    timing: (_: unknown, config: unknown) => {
      h.timing(config);
      return {};
    },
    delay: () => ({}),
    sequence: () => ({}),
    loop: () => ({ start: h.start, stop: h.stop }),
  },
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({
    children,
    onLayout,
  }: PropsWithChildren<{ onLayout?: (e: LayoutChangeEvent) => void }>) =>
    container({ children, onLayout }),
}));
vi.mock("../src/shared/theme", () => ({ colors: { muted: "#666" } }));
import { LyricMarquee } from "../src/features/audio/LyricMarquee";
function render(playing = true) {
  h.cursor = 0;
  h.layouts = [];
  const html = renderToStaticMarkup(
    React.createElement(LyricMarquee, { text: "Long current lyric", playing }),
  );
  h.effects.splice(0).forEach((effect) => effect());
  return html;
}
async function measure(viewport: number, text: number) {
  render();
  await Promise.resolve();
  render();
  h.layouts[0]({
    nativeEvent: { layout: { width: viewport } },
  } as LayoutChangeEvent);
  h.layouts[1]({
    nativeEvent: { layout: { width: text } },
  } as LayoutChangeEvent);
  render();
}
beforeEach(() => {
  h.cursor = 0;
  h.cells = [];
  h.effects = [];
  h.cleanups = [];
  vi.clearAllMocks();
});
it("leaves fitting lyrics still and loops overflowing lyrics with the native driver", async () => {
  await measure(200, 100);
  expect(h.start).not.toHaveBeenCalled();
  h.layouts[1]({
    nativeEvent: { layout: { width: 300 } },
  } as LayoutChangeEvent);
  render();
  expect(h.start).toHaveBeenCalledOnce();
  expect(h.timing).toHaveBeenCalledWith(
    expect.objectContaining({
      toValue: -332,
      useNativeDriver: true,
      isInteraction: false,
    }),
  );
});
it("stops on pause, reduced motion and background, and cleans up on unmount", async () => {
  await measure(200, 300);
  render(false);
  expect(h.stop).toHaveBeenCalledTimes(1);
  render();
  expect(h.start).toHaveBeenCalledTimes(2);
  h.motion!(true);
  render();
  expect(h.stop).toHaveBeenCalledTimes(2);
  h.motion!(false);
  render();
  expect(h.start).toHaveBeenCalledTimes(3);
  h.appState!("background");
  render();
  expect(h.stop).toHaveBeenCalledTimes(3);
  h.appState!("active");
  render();
  expect(h.start).toHaveBeenCalledTimes(4);
  h.cleanups.forEach((cleanup) => cleanup());
  expect(h.remove).toHaveBeenCalledTimes(2);
});
