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
      pending ??= Promise.resolve()
        .then(fetchCatalog)
        .then((value) => {
          snapshot = { items: parsePlaylistCatalog(value), status: "ready" };
        })
        .catch(() => {
          snapshot = { ...snapshot, status: "offline" };
        })
        .finally(() => {
          pending = undefined;
          for (const listener of listeners) listener();
        });
      return pending;
    },
  };
}
