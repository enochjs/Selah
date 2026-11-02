import { useEffect, useSyncExternalStore } from "react";
import hymnCatalog from "@selah/content/hymns.json";
import { createHymnCatalog, parseHymnCatalog } from "../../data/hymn-catalog";
import { resourceUrl } from "../../config/resources";
import type { Locale } from "../../domain/models";
import { hymns } from "./catalog";

const catalog = createHymnCatalog(parseHymnCatalog(hymnCatalog), async () => {
  const url = resourceUrl("/api/hymns");
  if (!url) throw new Error("Resource server unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Hymn catalog unavailable");
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
});

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
    const timer = setInterval(() => {
      void catalog.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  return { tracks: hymns(locale, items), status, refresh: catalog.refresh };
}
