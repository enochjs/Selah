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

it("cycles reading content in one store notification per tap without transient language modes", () => {
  useAppStore.setState({ primaryLocale: "zh", showTranslation: false });
  const changes: unknown[] = [];
  const unsubscribe = useAppStore.subscribe(
    ({ primaryLocale, showTranslation }) => {
      changes.push({ primaryLocale, showTranslation });
    },
  );
  for (let tap = 0; tap < 4; tap++)
    useAppStore.getState().cycleReadingContent();
  unsubscribe();
  expect(changes).toEqual([
    { primaryLocale: "en", showTranslation: false },
    { primaryLocale: "zh", showTranslation: true },
    { primaryLocale: "en", showTranslation: true },
    { primaryLocale: "zh", showTranslation: false },
  ]);
});

it("starts with the preferred bilingual reading configuration", () => {
  expect(useAppStore.getState()).toMatchObject({
    locale: "zh",
    primaryLocale: "zh",
    showTranslation: true,
    readingFonts: { zh: "lxgw-wenkai", en: "lora" },
    fontSize: 16,
    lineHeight: 1.4,
    dailyGoal: 10,
  });
});

it.each([
  [12, 14],
  [14, 14],
  [16, 16],
  [24, 24],
  [26, 24],
])(
  "limits text size %s to %s when changing and restoring preferences",
  (size, expected) => {
    useAppStore.getState().setFontSize(size);
    expect(useAppStore.getState().fontSize).toBe(expected);
    const restored = useAppStore.persist.getOptions().merge!(
      { fontSize: size, bookmarks: ["john:3:16"] },
      useAppStore.getInitialState(),
    );
    expect(restored.fontSize).toBe(expected);
    expect(restored.bookmarks).toEqual(["john:3:16"]);
  },
);

it("retains existing personal reading choices after the defaults change", () => {
  const saved = {
    locale: "en",
    primaryLocale: "en",
    showTranslation: false,
    readingFonts: { zh: "noto-serif-sc", en: "source-serif-4" },
    fontSize: 20,
    lineHeight: 1.8,
    dailyGoal: 15,
  };
  expect(
    useAppStore.persist.getOptions().merge!(
      saved,
      useAppStore.getInitialState(),
    ),
  ).toMatchObject(saved);
});

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
it("keeps focus mode transient so navigation is available after restarting", () => {
  useAppStore.getState().setReaderChromeHidden(true);
  const options = useAppStore.persist.getOptions();
  const saved = options.partialize!(useAppStore.getState());
  expect(saved).not.toHaveProperty("readerChromeHidden");
  expect(
    options.merge!({ readerChromeHidden: true }, useAppStore.getInitialState())
      .readerChromeHidden,
  ).toBe(false);
});

it("saves Chinese and English fonts independently and restores them after restart", () => {
  const store = useAppStore.getState();
  store.setReadingFont("zh", "lxgw-wenkai");
  store.setReadingFont("en", "lora");
  const options = useAppStore.persist.getOptions();
  const saved = options.partialize!(useAppStore.getState());
  const restored = options.merge!(saved, useAppStore.getInitialState());
  expect(restored.readingFonts).toEqual({ zh: "lxgw-wenkai", en: "lora" });
  expect(restored.readingPosition).toEqual(store.readingPosition);
  expect(restored.primaryLocale).toBe(store.primaryLocale);
});

it.each([
  [{}, { zh: "lxgw-wenkai", en: "lora" }],
  [
    { readingFonts: { zh: "noto-sans-sc" } },
    { zh: "noto-sans-sc", en: "lora" },
  ],
  [
    { readingFonts: { zh: "deleted-font", en: "dm-sans" } },
    { zh: "lxgw-wenkai", en: "dm-sans" },
  ],
  [{ readingFonts: null }, { zh: "lxgw-wenkai", en: "lora" }],
])(
  "restores legacy or invalid font preferences safely: %j",
  (saved, expected) => {
    const restored = useAppStore.persist.getOptions().merge!(
      saved,
      useAppStore.getInitialState(),
    );
    expect(restored.readingFonts).toEqual(expected);
  },
);
