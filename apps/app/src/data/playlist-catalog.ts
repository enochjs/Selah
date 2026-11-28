import type { CloudPlaylist } from "../domain/music-library";

export function parsePlaylistCatalog(value: unknown): CloudPlaylist[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("revision" in value) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !("items" in value) ||
    !Array.isArray(value.items)
  )
    throw new Error("Invalid playlist catalog");
  const items: CloudPlaylist[] = [];
  const ids = new Set<string>();
  for (const row of value.items as unknown[]) {
    if (!row || typeof row !== "object") throw new Error("Invalid playlist");
    const item = row as Record<string, unknown>;
    if (
      !["id", "titleZh", "titleEn"].every(
        (key) => typeof item[key] === "string" && String(item[key]).trim(),
      ) ||
      !["descriptionZh", "descriptionEn"].every(
        (key) => typeof item[key] === "string",
      ) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.id)) ||
      !["morning", "mountains", "lake"].includes(String(item.cover)) ||
      typeof item.enabled !== "boolean" ||
      !Array.isArray(item.hymnIds) ||
      !item.hymnIds.every(
        (id: unknown) =>
          typeof id === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id),
      ) ||
      new Set(item.hymnIds).size !== item.hymnIds.length ||
      ids.has(String(item.id))
    )
      throw new Error("Invalid playlist");
    ids.add(String(item.id));
    if (item.enabled) items.push(row as CloudPlaylist);
  }
  return items;
}

type CatalogSnapshot = {
  items: CloudPlaylist[];
  status: "loading" | "ready" | "offline";
};

function samePlaylist(a: CloudPlaylist, b: CloudPlaylist): boolean {
  return (
    a.id === b.id &&
    a.titleZh === b.titleZh &&
    a.titleEn === b.titleEn &&
    a.descriptionZh === b.descriptionZh &&
    a.descriptionEn === b.descriptionEn &&
    a.cover === b.cover &&
    a.enabled === b.enabled &&
    a.hymnIds.length === b.hymnIds.length &&
    a.hymnIds.every((id, index) => id === b.hymnIds[index])
  );
}

function samePlaylists(a: CloudPlaylist[], b: CloudPlaylist[]): boolean {
  return a.length === b.length && a.every((item, index) => samePlaylist(item, b[index]));
}

export function createPlaylistCatalog(fetchCatalog: () => Promise<unknown>) {
  let snapshot: CatalogSnapshot = { items: [], status: "loading" };
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh(): Promise<void> {
      pending ??= (async () => {
        const previous = snapshot;
        try {
          const parsed = parsePlaylistCatalog(await fetchCatalog());
          if (previous.status !== "ready" || !samePlaylists(previous.items, parsed)) {
            snapshot = {
              items: samePlaylists(previous.items, parsed) ? previous.items : parsed,
              status: "ready",
            };
          }
        } catch {
          if (previous.status !== "offline") {
            snapshot = { ...previous, status: "offline" };
          }
        } finally {
          pending = undefined;
          if (snapshot !== previous) {
            for (const listener of listeners) listener();
          }
        }
      })();
      return pending;
    },
  };
}
