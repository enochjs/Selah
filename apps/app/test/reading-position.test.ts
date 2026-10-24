import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
import { useAppStore } from "../src/state/app-store";

beforeEach(() => useAppStore.setState(useAppStore.getInitialState()));

it("keeps the visible reading position when narration selects another verse", () => {
  const store = useAppStore.getState();
  store.saveReadingPosition({
    bookId: "psalms",
    chapter: 23,
    verse: 4,
    offset: 32,
  });
  store.setSelectedVerse(5);
  expect(useAppStore.getState().readingPosition).toEqual({
    bookId: "psalms",
    chapter: 23,
    verse: 4,
    offset: 32,
  });
});

it("resumes the saved verse and its offset after visiting another chapter", () => {
  const store = useAppStore.getState();
  store.saveReadingPosition({
    bookId: "psalms",
    chapter: 23,
    verse: 4,
    offset: 32,
  });
  store.setChapter("john", 1, 12);
  store.resumeReading();
  expect(useAppStore.getState()).toMatchObject({
    bookId: "psalms",
    chapter: 23,
    selectedVerse: 4,
    readingRequest: { bookId: "psalms", chapter: 23, verse: 4, offset: 32 },
  });
});

it("keeps an explicit chapter jump separate from the last viewed position", () => {
  const store = useAppStore.getState();
  store.saveReadingPosition({
    bookId: "psalms",
    chapter: 23,
    verse: 4,
    offset: 32,
  });
  store.setChapter("john", 1, 12);
  expect(useAppStore.getState().readingPosition.verse).toBe(4);
  expect(useAppStore.getState().readingRequest).toEqual({
    bookId: "john",
    chapter: 1,
    verse: 12,
    offset: 0,
  });
});

it("restores existing version-one saved data without losing vocabulary or bookmarks", () => {
  const merge = useAppStore.persist.getOptions().merge!;
  const legacy = {
    bookId: "john",
    chapter: 3,
    selectedVerse: 16,
    bookmarks: ["john:3:16"],
    words: [],
  };
  const merged = merge(legacy, useAppStore.getState());
  expect(merged.readingPosition).toEqual({
    bookId: "john",
    chapter: 3,
    verse: 16,
    offset: 0,
  });
  expect(merged.bookmarks).toEqual(legacy.bookmarks);
  expect(merged.words).toEqual([]);
});
