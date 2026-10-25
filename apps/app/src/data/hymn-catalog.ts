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
) {
  let snapshot = initial;
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
      pending ??= fetchCatalog()
        .then((value) => {
          snapshot = parseHymnCatalog(value);
          for (const listener of listeners) listener();
        })
        .catch(() => {
          // Keep bundled or last successfully fetched content when offline.
        })
        .finally(() => {
          pending = undefined;
        });
      return pending;
    },
  };
}
