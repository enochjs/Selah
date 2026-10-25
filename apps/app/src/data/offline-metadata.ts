import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  OfflineChanges,
  OfflineSnapshot,
} from "../domain/download-manager";

const prefix = "selah-offline-v1:";
export type MetadataStorage = Pick<
  typeof AsyncStorage,
  "getItem" | "setItem" | "multiGet" | "multiSet" | "multiRemove"
>;
export function offlineMetadata(storage: MetadataStorage = AsyncStorage) {
  let previous: OfflineSnapshot | null = null;
  return {
    async read(): Promise<OfflineSnapshot | null> {
      const index = await storage.getItem(prefix + "index");
      if (!index) return null;
      const keys = JSON.parse(index) as {
        chapters: string[];
        assets: string[];
        wifiOnly: boolean;
      };
      if (!Array.isArray(keys.chapters) || !Array.isArray(keys.assets))
        throw new Error("Invalid offline index");
      const names = [
        ...keys.chapters.map((key) => prefix + "chapter:" + key),
        ...keys.assets.map((key) => prefix + "asset:" + key),
      ];
      const values = names.length ? await storage.multiGet(names) : [];
      const chapters: OfflineSnapshot["chapters"] = {},
        assets: OfflineSnapshot["assets"] = {};
      for (const [name, value] of values)
        if (value) {
          if (name.startsWith(prefix + "chapter:"))
            chapters[name.slice((prefix + "chapter:").length)] =
              JSON.parse(value);
          else
            assets[name.slice((prefix + "asset:").length)] = JSON.parse(value);
        }
      previous = { chapters, assets, wifiOnly: keys.wifiOnly !== false };
      return previous;
    },
    async write(snapshot: OfflineSnapshot, changes?: OfflineChanges) {
      const changed: [string, string][] = [];
      const removed: string[] = [];
      for (const kind of ["chapters", "assets"] as const) {
        const keys = changes
          ? changes[kind]
          : new Set([
              ...Object.keys(snapshot[kind]),
              ...Object.keys(previous?.[kind] ?? {}),
            ]);
        const recordPrefix =
          prefix + (kind === "chapters" ? "chapter:" : "asset:");
        for (const key of keys) {
          const value = snapshot[kind][key];
          if (value === undefined) {
            if (previous?.[kind][key] !== undefined)
              removed.push(recordPrefix + key);
          } else if (previous?.[kind][key] !== value) {
            changed.push([recordPrefix + key, JSON.stringify(value)]);
          }
        }
      }
      if (changed.length) await storage.multiSet(changed);
      await storage.setItem(
        prefix + "index",
        JSON.stringify({
          chapters: Object.keys(snapshot.chapters),
          assets: Object.keys(snapshot.assets),
          wifiOnly: snapshot.wifiOnly,
        }),
      );
      if (removed.length) await storage.multiRemove(removed);
      previous = snapshot;
    },
  };
}
