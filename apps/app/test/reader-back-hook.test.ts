import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  focus: null as (() => (() => void) | undefined) | null,
  back: null as (() => boolean) | null,
  remove: vi.fn(),
  state: {
    bookId: "genesis",
    chapter: 1,
    toast: null as string | null,
    notify: vi.fn<(message: string | null) => void>(),
  },
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (focus: typeof context.focus) => {
    context.focus = focus;
  },
}));
vi.mock("react-native", () => ({
  Platform: { OS: "android" },
  BackHandler: {
    addEventListener: (_event: string, listener: () => boolean) => {
      context.back = listener;
      return { remove: context.remove };
    },
  },
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: { getState: () => context.state },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
import { useReaderBackGuard } from "../src/features/reader/useReaderBackGuard";

function Probe() {
  useReaderBackGuard(true);
  return null;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1000);
  vi.clearAllMocks();
  context.state.chapter = 1;
  context.state.toast = null;
  context.state.notify.mockImplementation((message) => {
    context.state.toast = message;
  });
  renderToStaticMarkup(React.createElement(Probe));
});
afterEach(() => vi.useRealTimers());

it("consumes an accidental system back and releases the second explicit back to the router", () => {
  const cleanup = context.focus?.();
  expect(context.back?.()).toBe(true);
  expect(context.state.toast).toContain("再次");
  vi.advanceTimersByTime(500);
  expect(context.back?.()).toBe(false);
  expect(context.state.toast).toBeNull();
  cleanup?.();
  expect(context.remove).toHaveBeenCalledOnce();
});

it("expires the hint and never reuses a back confirmation across chapter changes", () => {
  const cleanup = context.focus?.();
  expect(context.back?.()).toBe(true);
  context.state.chapter = 2;
  vi.advanceTimersByTime(100);
  expect(context.back?.()).toBe(true);
  vi.advanceTimersByTime(1501);
  expect(context.state.toast).toBeNull();
  expect(context.back?.()).toBe(true);
  cleanup?.();
  expect(context.state.toast).toBeNull();
});
