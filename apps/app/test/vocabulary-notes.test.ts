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
it("saves a supplied definition separately from an optional personal note", () => {
  const store = useAppStore.getState();
  store.addWord("abundant", "丰富的", "John 10:10", "", "联想到丰盛的生命");
  const word = useAppStore.getState().words[0];
  expect(word).toMatchObject({
    word: "abundant",
    meaning: "丰富的",
    note: "联想到丰盛的生命",
  });
  store.updateWordDetails(word.id, "充足的", "新的笔记");
  expect(useAppStore.getState().words[0]).toMatchObject({
    meaning: "充足的",
    note: "新的笔记",
    dueAt: word.dueAt,
  });
});
it("restores existing definitions and review history without treating them as new notes", () => {
  const current = useAppStore.getInitialState();
  const legacy = { ...current.words[0], meaning: "我的旧释义" };
  const merged = useAppStore.persist.getOptions().merge!(
    { words: [legacy], reviews: current.reviews },
    current,
  );
  expect(merged.words[0]).toEqual(legacy);
});
