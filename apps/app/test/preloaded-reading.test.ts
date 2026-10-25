import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReadingPosition } from "../src/domain/reading";

const context = vi.hoisted(() => ({
  handle: null as ReturnType<typeof useReadingProgress> | null,
  state: {
    bookId: "genesis",
    chapter: 1,
    selectedVerse: 8,
    readingRequest: null as ReadingPosition | null,
    readingPosition: { bookId: "genesis", chapter: 1, verse: 1, offset: 0 },
    saveReadingPosition: vi.fn(),
  },
}));
vi.mock("react-native", () => ({ AppState: { currentState: "active" } }));
vi.mock("expo-router", () => ({
  useFocusEffect: (focus: () => unknown) => {
    focus();
  },
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(
    (selector: (state: typeof context.state) => unknown) =>
      selector(context.state),
    {
      getState: () => context.state,
    },
  ),
}));
import { useReadingProgress } from "../src/features/reader/useReadingProgress";

function Probe({ chapter }: { chapter: number }) {
  context.handle = useReadingProgress("genesis", chapter, { current: null });
  return null;
}
function layout() {
  const handle = context.handle;
  if (!handle) throw new Error("missing reading viewport");
  handle.onLayout(400);
  handle.onContentSizeChange(393, 2000);
  handle.registerVerse({ verse: 1, y: 0, height: 200 });
  return handle;
}
beforeEach(() => {
  context.handle = null;
  context.state.chapter = 1;
  vi.clearAllMocks();
});

it("preloads an adjacent chapter without replacing history or following narration", () => {
  renderToStaticMarkup(React.createElement(Probe, { chapter: 2 }));
  const handle = layout();
  handle.flush();
  expect(handle.isForeground()).toBe(false);
  expect(context.state.saveReadingPosition).not.toHaveBeenCalled();
});

it("lets a preloaded page record progress only after it becomes the selected chapter", () => {
  renderToStaticMarkup(React.createElement(Probe, { chapter: 2 }));
  const handle = layout();
  context.state.chapter = 2;
  expect(handle.isForeground()).toBe(true);
  handle.flush();
  expect(context.state.saveReadingPosition).toHaveBeenCalledWith({
    bookId: "genesis",
    chapter: 2,
    verse: 1,
    offset: 0,
  });
  context.state.chapter = 3;
  context.state.saveReadingPosition.mockClear();
  handle.flush();
  expect(context.state.saveReadingPosition).not.toHaveBeenCalled();
});
