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
      // Whole-Bible downloads contain thousands of records. Bound native I/O
      // concurrency without making playback wait for each read in sequence.
      for (let index = 0; index < keys.length; index += 16) {
        const batch = await Promise.all(
          keys
            .slice(index, index + 16)
            .map(async (key): Promise<[string, string | null]> => [
              key,
              await storage.getItem(key),
            ]),
        );
        result.push(...batch);
      }
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
