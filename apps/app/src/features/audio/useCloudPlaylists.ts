import { useEffect, useSyncExternalStore } from "react";
import { createPlaylistCatalog } from "../../data/playlist-catalog";
import { resourceUrl } from "../../config/resources";

const catalog = createPlaylistCatalog(async () => {
  const url = resourceUrl("/api/playlists");
  if (!url) throw new Error("Resource server unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      credentials: "omit",
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Playlist catalog unavailable");
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timeout);
  }
});

export function useCloudPlaylists() {
  const snapshot = useSyncExternalStore(
    catalog.subscribe,
    catalog.getSnapshot,
    catalog.getSnapshot,
  );
  useEffect(() => {
    void catalog.refresh();
    const timer = setInterval(() => {
      void catalog.refresh();
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  return { ...snapshot, refresh: catalog.refresh };
}
