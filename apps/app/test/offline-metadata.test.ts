import { expect, it, vi } from "vitest";
import {
  offlineMetadata,
  type MetadataStorage,
} from "../src/data/offline-metadata";
import type { OfflineSnapshot } from "../src/domain/download-manager";
vi.mock("@react-native-async-storage/async-storage", () => ({ default: {} }));
function setup() {
  const values = new Map<string, string>();
  const storage: MetadataStorage = {
    getItem: async (key) => values.get(key) ?? null,
    setItem: vi.fn(async (key, value) => {
      values.set(key, value);
    }),
    multiGet: async (keys) => keys.map((key) => [key, values.get(key) ?? null]),
    multiSet: vi.fn(async (entries) => {
      for (const [key, value] of entries) values.set(key, value);
    }),
    multiRemove: vi.fn(async (keys) => {
      for (const key of keys) values.delete(key);
    }),
  };
  return { storage, values, metadata: offlineMetadata(storage) };
}
const asset = {
  path: "/one",
  sha256: "a".repeat(64),
  size: 3,
  uri: "offline:a",
};
const initial: OfflineSnapshot = {
  chapters: {},
  assets: { one: asset },
  wifiOnly: true,
};
it("limits delta serialization to declared keys while preserving index and wifi settings", async () => {
  const { metadata, storage } = setup();
  await metadata.write(initial);
  vi.mocked(storage.multiSet).mockClear();
  const untouched = {
    ...asset,
    toJSON: () => {
      throw new Error("Unchanged record serialized");
    },
  };
  await metadata.write(
    { ...initial, assets: { one: untouched, two: asset }, wifiOnly: false },
    { chapters: [], assets: ["two"] },
  );
  expect(storage.multiSet).toHaveBeenCalledWith([
    ["selah-offline-v1:asset:two", JSON.stringify(asset)],
  ]);
  expect(await metadata.read()).toEqual({
    ...initial,
    assets: { one: asset, two: asset },
    wifiOnly: false,
  });
});
it("persists delta deletion and retries after an index write failure", async () => {
  const { metadata, storage, values } = setup();
  await metadata.write(initial);
  vi.mocked(storage.setItem).mockRejectedValueOnce(new Error("disk full"));
  const empty = { ...initial, assets: {} };
  await expect(
    metadata.write(empty, { chapters: [], assets: ["one"] }),
  ).rejects.toThrow("disk full");
  await metadata.write(empty, { chapters: [], assets: ["one"] });
  expect(values.has("selah-offline-v1:asset:one")).toBe(false);
  expect(await metadata.read()).toEqual(empty);
});
it("keeps full snapshot diff compatibility and retries failed record writes", async () => {
  const { metadata, storage } = setup();
  vi.mocked(storage.multiSet).mockRejectedValueOnce(new Error("disk full"));
  await expect(metadata.write(initial)).rejects.toThrow("disk full");
  await metadata.write(initial);
  expect(await metadata.read()).toEqual(initial);
  await metadata.write({ ...initial, assets: {}, wifiOnly: false });
  expect(await metadata.read()).toEqual({
    ...initial,
    assets: {},
    wifiOnly: false,
  });
});
