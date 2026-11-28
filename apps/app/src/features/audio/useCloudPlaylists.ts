import { compatibleFetch } from "../../data/update-compatibility";
import { useEffect, useSyncExternalStore } from "react";
import { createPlaylistCatalog } from "../../data/playlist-catalog";
import { resourceUrl } from "../../config/resources";

const catalog = createPlaylistCatalog(async () => {
  const url = resourceUrl("/api/playlists");
  if (!url) throw new Error("Resource server unavailable");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await compatibleFetch(url, {
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

const idleSnapshot = { items: [], status: "ready" as const };
const noopSubscribe = () => () => {};
const getIdleSnapshot = () => idleSnapshot;

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

export function useCloudPlaylists(enabled = true) {
  const snapshot = useSyncExternalStore(
    enabled ? catalog.subscribe : noopSubscribe,
    enabled ? catalog.getSnapshot : getIdleSnapshot,
    enabled ? catalog.getSnapshot : getIdleSnapshot,
  );
  useEffect(() => {
    if (!enabled) return;
    void catalog.refresh();
    return retainPolling();
  }, [enabled]);
  return { ...snapshot, refresh: catalog.refresh };
}
