import { Directory, File, Paths } from "expo-file-system";
import { offlineMetadata, type MetadataStorage } from "./offline-metadata";

// Keep the potentially large media index outside AsyncStorage's Android quota.
export function nativeOfflineMetadata() {
  const directory = new Directory(Paths.document, "selah-offline-index");
  const file = (key: string, suffix = ".json") =>
    new File(directory, encodeURIComponent(key) + suffix);
  const storage: MetadataStorage = {
    async getItem(key) {
      const target = file(key);
      return target.exists ? target.text() : null;
    },
    async setItem(key, value) {
      directory.create({ idempotent: true, intermediates: true });
      const temporary = file(key, ".tmp");
      await temporary.write(value);
      await temporary.move(file(key), { overwrite: true });
    },
    async multiGet(keys) {
      const result: [string, string | null][] = [];
      for (const key of keys) result.push([key, await storage.getItem(key)]);
      return result;
    },
    async multiSet(entries) {
      for (const [key, value] of entries) await storage.setItem(key, value);
    },
    async multiRemove(keys) {
      for (const key of keys) {
        const target = file(key);
        if (target.exists) target.delete();
      }
    },
  };
  return offlineMetadata(storage);
}
