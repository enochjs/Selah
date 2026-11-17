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

it("starts with the original olive theme for existing and new installations", () => {
  expect(useAppStore.getState().themePreference).toBe("olive");
  const merge = useAppStore.persist.getOptions().merge!;
  for (const themePreference of [undefined, null, "deleted", {}, 42]) {
    expect(
      merge(
        { themePreference, bookmarks: ["john:3:16"] },
        useAppStore.getInitialState(),
      ),
    ).toMatchObject({ themePreference: "olive", bookmarks: ["john:3:16"] });
  }
});

it.each(["olive", "mist", "night", "redemption", "system"] as const)(
  "persists and restores %s without changing the reading session or learning data",
  (themePreference) => {
    const before = useAppStore.getState();
    before.setThemePreference(themePreference);
    const options = useAppStore.persist.getOptions();
    const saved = options.partialize!(useAppStore.getState());
    expect(saved).toMatchObject({ themePreference });
    expect(options.merge!(saved, useAppStore.getInitialState())).toMatchObject({
      themePreference,
      readingPosition: before.readingPosition,
      readingFonts: before.readingFonts,
      bookmarks: before.bookmarks,
      words: before.words,
      repeatMode: before.repeatMode,
    });
    expect(useAppStore.getState().readingRequest).toBe(before.readingRequest);
  },
);
