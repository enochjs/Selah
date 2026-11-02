import AsyncStorage from "@react-native-async-storage/async-storage";
import bundledCatalog from "@selah/content/daily-verses.json";
import { parseDailyVerseCatalog } from "@selah/content/daily-verses";
import { createDailyVerseCatalog } from "./daily-verse-catalog";
import { bibleRepository } from "./bible-repository";
import { dailyPassage } from "../domain/daily-verse";
import { resourceUrl } from "../config/resources";
import {
  bundledDailyVerseImage,
  downloadDailyVerseImage,
  readDailyVerseImage,
} from "./daily-verse-storage";

const key = "selah-daily-verses-v1";
export const dailyVerseRuntime = createDailyVerseCatalog(
  parseDailyVerseCatalog(bundledCatalog),
  {
    async readCatalog() {
      const saved = await AsyncStorage.getItem(key);
      return saved ? (JSON.parse(saved) as unknown) : null;
    },
    writeCatalog: (catalog) =>
      AsyncStorage.setItem(key, JSON.stringify(catalog)),
    async fetchCatalog(signal) {
      const url = resourceUrl("/api/daily-verses");
      if (!url) throw new Error("Daily scripture server unavailable");
      const response = await fetch(url, {
        signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Daily scripture unavailable");
      return (await response.json()) as unknown;
    },
    validReference: (reference) =>
      dailyPassage(reference, bibleRepository) !== null,
    bundledImage: bundledDailyVerseImage,
    readImage: readDailyVerseImage,
    downloadImage: downloadDailyVerseImage,
  },
);
