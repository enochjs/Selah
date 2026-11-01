import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  focus: undefined as (() => void | (() => void)) | undefined,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useEffect: (effect: () => unknown) => effect(),
}));
vi.mock("expo-router", () => ({
  useFocusEffect: (effect: typeof harness.focus) => {
    harness.focus = effect;
  },
}));
import { useChapterKeyboard } from "../src/features/reader/reader-input.web";
afterEach(() => vi.unstubAllGlobals());

it("only handles chapter keys while the retained Bible tab is focused", () => {
  const listeners = new Set<(event: KeyboardEvent) => void>();
  vi.stubGlobal("document", {
    addEventListener: (
      _name: string,
      listener: (event: KeyboardEvent) => void,
    ) => listeners.add(listener),
    removeEventListener: (
      _name: string,
      listener: (event: KeyboardEvent) => void,
    ) => listeners.delete(listener),
    querySelector: () => null,
  });
  vi.stubGlobal("window", { getSelection: () => null });
  vi.stubGlobal("HTMLElement", class {});
  const change = vi.fn();
  function Probe() {
    useChapterKeyboard(true, change);
    return null;
  }
  renderToStaticMarkup(React.createElement(Probe));
  expect(listeners.size).toBe(0);
  const blur = harness.focus?.();
  expect(listeners.size).toBe(1);
  const event = {
    key: "ArrowRight",
    target: null,
    preventDefault: vi.fn(),
  } as unknown as KeyboardEvent;
  listeners.forEach((listener) => listener(event));
  expect(change).toHaveBeenCalledWith(1);
  if (typeof blur === "function") blur();
  expect(listeners.size).toBe(0);
  listeners.forEach((listener) => listener(event));
  expect(change).toHaveBeenCalledOnce();
});
