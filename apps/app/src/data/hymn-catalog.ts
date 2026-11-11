import type { PublishedHymn } from "../domain/hymns";

export function parseHymnCatalog(value: unknown): PublishedHymn[] {
  if (
    !value ||
    typeof value !== "object" ||
    !("revision" in value) ||
    !Number.isSafeInteger(value.revision) ||
    Number(value.revision) < 0 ||
    !("items" in value) ||
    !Array.isArray(value.items)
  )
    throw new Error("Invalid hymn catalog");
  const items: PublishedHymn[] = [];
  const ids = new Set<string>();
  for (const row of value.items as unknown[]) {
    if (!row || typeof row !== "object") throw new Error("Invalid hymn");
    const item = row as Record<string, unknown>;
    if (
      ![
        "id",
        "titleZh",
        "titleEn",
        "subtitleZh",
        "subtitleEn",
        "audioPath",
      ].every(
        (key) => typeof item[key] === "string" && String(item[key]).trim(),
      ) ||
      typeof item.duration !== "number" ||
      !Number.isFinite(item.duration) ||
      item.duration <= 0 ||
      typeof item.enabled !== "boolean" ||
      (item.lyrics !== undefined &&
        (typeof item.lyrics !== "string" || item.lyrics.length > 40000)) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(item.id)) ||
      !/^\/api\/audio\/(?:resources|hymns)\/[a-f0-9]{64}\.mp3$/.test(
        String(item.audioPath),
      ) ||
      ids.has(String(item.id))
    )
      throw new Error("Invalid hymn");
    ids.add(String(item.id));
    if (
      item.enabled &&
      (item.reviewStatus === undefined || item.reviewStatus === "approved")
    )
      items.push(row as PublishedHymn);
  }
  return items;
}

/** A successful response is authoritative, including an empty list; failures preserve playback. */
export function createHymnCatalog(
  initial: PublishedHymn[],
  fetchCatalog: () => Promise<unknown>,
  storage?: { read(): Promise<unknown>; write(value: unknown): Promise<void> },
) {
  let snapshot = initial;
  let status: "loading" | "ready" | "offline" = "loading";
  let pending: Promise<void> | undefined;
  const listeners = new Set<() => void>();
  let restored = false;
  return {
    getSnapshot: () => snapshot,
    getStatus: () => status,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    refresh(): Promise<void> {
      pending ??= Promise.resolve()
        .then(async () => {
          if (restored) return;
          restored = true;
          try {
            const saved = await storage?.read();
            if (saved) snapshot = parseHymnCatalog(saved);
          } catch {
            // A damaged cache must not block a fresh server response.
          }
        })
        .then(fetchCatalog)
        .then(async (value) => {
          snapshot = parseHymnCatalog(value);
          status = "ready";
          try {
            await storage?.write(value);
          } catch {
            // Online songs remain usable when local catalog storage is full.
          }
        })
        .catch(() => {
          // Keep bundled or last successfully fetched content when offline.
          status = "offline";
        })
        .finally(() => {
          pending = undefined;
          for (const listener of listeners) listener();
        });
      return pending;
    },
  };
}
