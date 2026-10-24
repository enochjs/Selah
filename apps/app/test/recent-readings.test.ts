import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
import { useAppStore } from "../src/state/app-store";
import { readerHeaderCollapsed } from "../src/domain/reading";

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));

it("remembers the visible verse and offset when switching chapters and restores it from recent readings", () => {
  const store = useAppStore.getState();
  const position = { bookId: "psalms", chapter: 23, verse: 4, offset: 32 };
  store.saveReadingPosition(position);
  store.setChapter("romans", 8);
  store.saveReadingPosition({
    bookId: "romans",
    chapter: 8,
    verse: 28,
    offset: 15,
  });
  expect(useAppStore.getState().recentReadings).toContainEqual(position);
  store.openReadingPosition(position);
  expect(useAppStore.getState()).toMatchObject({
    bookId: "psalms",
    chapter: 23,
    selectedVerse: 4,
    readingRequest: position,
    followingNarration: false,
  });
  expect(useAppStore.getState().recentReadings[0]).toEqual(position);
});

it("updates the latest position per chapter without duplicate entries and bounds history", () => {
  const store = useAppStore.getState();
  for (let chapter = 1; chapter <= 12; chapter++)
    store.setChapter("john", chapter);
  store.saveReadingPosition({
    bookId: "john",
    chapter: 12,
    verse: 4,
    offset: 20,
  });
  store.saveReadingPosition({
    bookId: "john",
    chapter: 12,
    verse: 5,
    offset: 10,
  });
  const history = useAppStore.getState().recentReadings;
  expect(history).toHaveLength(6);
  expect(history[0]).toEqual({
    bookId: "john",
    chapter: 12,
    verse: 5,
    offset: 10,
  });
  expect(
    new Set(history.map((item) => `${item.bookId}:${item.chapter}`)).size,
  ).toBe(6);
});

it("keeps narration highlighting out of the actual reading history", () => {
  const store = useAppStore.getState();
  store.saveReadingPosition({
    bookId: "psalms",
    chapter: 23,
    verse: 2,
    offset: 10,
  });
  const history = useAppStore.getState().recentReadings;
  store.setSelectedVerse(5);
  expect(useAppStore.getState().recentReadings).toEqual(history);
});

it("preserves recent readings across reloads and never persists collapsed chrome", () => {
  const store = useAppStore.getState();
  store.setChapter("john", 3, 16);
  store.setReaderHeaderCollapsed(true);
  const options = useAppStore.persist.getOptions();
  const saved = options.partialize!(useAppStore.getState());
  expect(saved).not.toHaveProperty("readerHeaderCollapsed");
  const restored = options.merge!(saved, useAppStore.getInitialState());
  expect(restored.recentReadings).toEqual(
    useAppStore.getState().recentReadings,
  );
  expect(restored.readerHeaderCollapsed).toBe(false);
});

it("starts legacy libraries with their saved position in history without losing learning data", () => {
  const position = { bookId: "john", chapter: 3, verse: 16, offset: 20 };
  const restored = useAppStore.persist.getOptions().merge!(
    { readingPosition: position, bookmarks: ["john:3:16"] },
    useAppStore.getInitialState(),
  );
  expect(restored.recentReadings).toEqual([position]);
  expect(restored.bookmarks).toEqual(["john:3:16"]);
});

it("collapses mobile branding only after scrolling and avoids jitter near the boundary", () => {
  expect(readerHeaderCollapsed(90, false)).toBe(true);
  expect(readerHeaderCollapsed(35, true)).toBe(true);
  expect(readerHeaderCollapsed(35, false)).toBe(false);
  expect(readerHeaderCollapsed(0, true)).toBe(false);
});
