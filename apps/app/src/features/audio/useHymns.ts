import { compatibleFetch } from "../../data/update-compatibility";
import { useEffect, useMemo, useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import hymnCatalog from "@selah/content/hymns.json";
import { createHymnCatalog, parseHymnCatalog } from "../../data/hymn-catalog";
import { resourceUrl } from "../../config/resources";
import type { Locale } from "../../domain/models";
import { hymns } from "./catalog";

const catalog = createHymnCatalog(
  parseHymnCatalog(hymnCatalog),
  async () => {
    const url = resourceUrl("/api/hymns");
    if (!url) throw new Error("Resource server unavailable");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await compatibleFetch(url, {
        signal: controller.signal,
        credentials: "omit",
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Hymn catalog unavailable");
      return (await response.json()) as unknown;
    } finally {
      clearTimeout(timeout);
    }
  },
  {
    read: async () => {
      const saved = await AsyncStorage.getItem("selah-hymn-catalog-v1");
      return saved ? (JSON.parse(saved) as unknown) : null;
    },
    write: async (value) =>
      AsyncStorage.setItem("selah-hymn-catalog-v1", JSON.stringify(value)),
  },
);

let pollSubscribers = 0;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function retainPolling() {
  pollSubscribers += 1;
  if (pollSubscribers === 1) {
    pollTimer = setInterval(() => {
      void catalog.refresh();
    }, 60000);
  }
  return () => {
    pollSubscribers = Math.max(0, pollSubscribers - 1);
    if (pollSubscribers === 0 && pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  };
}

export function useHymns(locale: Locale) {
  return useHymnCatalog(locale).tracks;
}

export function useHymnCatalog(locale: Locale) {
  const items = useSyncExternalStore(
    catalog.subscribe,
    catalog.getSnapshot,
    catalog.getSnapshot,
  );
  const status = useSyncExternalStore(
    catalog.subscribe,
    catalog.getStatus,
    catalog.getStatus,
  );
  useEffect(() => {
    void catalog.refresh();
    return retainPolling();
  }, []);
  const tracks = useMemo(() => hymns(locale, items), [locale, items]);
  return { tracks, status, refresh: catalog.refresh };
}
