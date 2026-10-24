import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
import { useAppStore } from "../src/state/app-store";

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));

it("changes the primary language independently of the interface and translation visibility", () => {
  const store = useAppStore.getState();
  store.setLocale("en");
  store.setShowTranslation(false);
  store.setPrimaryLocale("zh");
  expect(useAppStore.getState()).toMatchObject({
    primaryLocale: "zh",
    locale: "en",
    showTranslation: false,
  });
  store.setShowTranslation(true);
  expect(useAppStore.getState().primaryLocale).toBe("zh");
});

it.each(["en", "zh"] as const)(
  "restores legacy %s-only reading as the primary language even when audio differed",
  (readingMode) => {
    const merged = useAppStore.persist.getOptions().merge!(
      { readingMode, audioLocale: readingMode === "zh" ? "en" : "zh" },
      useAppStore.getState(),
    );
    expect(merged).toMatchObject({
      primaryLocale: readingMode,
      showTranslation: false,
    });
    expect(merged).not.toHaveProperty("audioLocale");
    expect(merged).not.toHaveProperty("readingMode");
  },
);

it("migrates parallel reading and keeps learning data and the saved reading position", () => {
  const saved = {
    readingMode: "parallel",
    audioLocale: "zh",
    bookmarks: ["john:3:16"],
    words: [],
    reviews: [],
    readingPosition: { bookId: "john", chapter: 3, verse: 16, offset: 20 },
  };
  const merged = useAppStore.persist.getOptions().merge!(
    saved,
    useAppStore.getState(),
  );
  expect(merged).toMatchObject({
    primaryLocale: "zh",
    showTranslation: true,
    bookmarks: saved.bookmarks,
    words: saved.words,
    reviews: saved.reviews,
    readingPosition: saved.readingPosition,
  });
});

it("persists and restores the new preferences without independent narration settings", () => {
  const store = useAppStore.getState();
  store.setPrimaryLocale("zh");
  store.setShowTranslation(false);
  store.setLineHeight(1.8);
  const options = useAppStore.persist.getOptions();
  const saved = options.partialize!(useAppStore.getState());
  const merged = options.merge!(saved, useAppStore.getInitialState());
  expect(merged).toMatchObject({
    primaryLocale: "zh",
    showTranslation: false,
    lineHeight: 1.8,
  });
  expect(saved).not.toHaveProperty("audioLocale");
});
