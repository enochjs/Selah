import { beforeEach, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      storage.delete(key);
    },
  },
}));
import { useAppStore } from "../src/state/app-store";

beforeEach(() => {
  storage.clear();
  useAppStore.setState(useAppStore.getInitialState(), true);
});

it.each(["off", "verse", "chapter", "shuffle"] as const)(
  "restores the saved %s playback mode after restarting",
  async (mode) => {
    useAppStore.getState().setRepeatMode(mode);
    const saved = storage.get("selah-library-v1")!;
    expect(JSON.parse(saved).state.repeatMode).toBe(mode);
    useAppStore.setState(useAppStore.getInitialState(), true);
    storage.set("selah-library-v1", saved);
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().repeatMode).toBe(mode);
  },
);

it.each([undefined, null, "invalid", 1])(
  "defaults missing or invalid saved playback mode %s to sequential playback",
  async (repeatMode) => {
    storage.set(
      "selah-library-v1",
      JSON.stringify({
        version: 1,
        state: { repeatMode, bookmarks: ["john:3:16"] },
      }),
    );
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().repeatMode).toBe("off");
    expect(useAppStore.getState().bookmarks).toEqual(["john:3:16"]);
  },
);

it.each(["off", "verse", "chapter"] as const)(
  "restores Scripture mode %s independently of the saved hymn mode",
  async (mode) => {
    useAppStore.getState().setRepeatMode("shuffle");
    useAppStore.getState().setScriptureRepeatMode(mode);
    const saved = storage.get("selah-library-v1")!;
    useAppStore.setState(useAppStore.getInitialState(), true);
    storage.set("selah-library-v1", saved);
    await useAppStore.persist.rehydrate();
    expect(useAppStore.getState().scriptureRepeatMode).toBe(mode);
    expect(useAppStore.getState().repeatMode).toBe("shuffle");
  },
);

it("defaults old shared preferences to continuous Scripture playback", async () => {
  storage.set(
    "selah-library-v1",
    JSON.stringify({ version: 1, state: { repeatMode: "verse" } }),
  );
  await useAppStore.persist.rehydrate();
  expect(useAppStore.getState().scriptureRepeatMode).toBe("off");
  expect(useAppStore.getState().repeatMode).toBe("verse");
});
