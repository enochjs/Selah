import type { PublishedHymn } from "../domain/hymns";
import type { OfflineHymn } from "../domain/offline-audio";
import { DownloadFailure } from "../domain/download-manager";
import { parseHymnCatalog } from "./hymn-catalog";

/** The existing audio HEAD response supplies the server's actual file size. */
export function offlineHymn(
  hymn: PublishedHymn,
  contentLength: string | null,
): OfflineHymn {
  const parsed = parseHymnCatalog({ revision: 0, items: [hymn] });
  const size = Number(contentLength);
  const hash = hymn.audioPath.match(
    /^\/api\/audio\/(?:resources|hymns)\/([a-f0-9]{64})\.mp3$/,
  )?.[1];
  if (
    parsed.length !== 1 ||
    !hash ||
    !contentLength ||
    !Number.isSafeInteger(size) ||
    size <= 0
  )
    throw new DownloadFailure("unavailable");
  return {
    kind: "hymn",
    key: `hymn:${hymn.id}`,
    hymn: parsed[0],
    files: [{ path: hymn.audioPath, size, sha256: hash }],
  };
}

export async function resolveOfflineHymns(
  hymns: readonly PublishedHymn[],
  readContentLength: (path: string) => Promise<string | null>,
): Promise<{ items: OfflineHymn[]; skipped: number }> {
  const unique = [...new Map(hymns.map((hymn) => [hymn.id, hymn])).values()];
  const sizes = new Map<string, Promise<string | null>>();
  const items: OfflineHymn[] = [];
  // Limit simultaneous HEAD requests when selecting an entire catalog.
  for (let start = 0; start < unique.length; start += 6) {
    const results = await Promise.allSettled(
      unique.slice(start, start + 6).map(async (hymn) => {
        offlineHymn(hymn, "1");
        const path = hymn.audioPath;
        let size = sizes.get(path);
        if (!size) {
          size = readContentLength(path);
          sizes.set(path, size);
        }
        return offlineHymn(hymn, await size);
      }),
    );
    for (const result of results)
      if (result.status === "fulfilled") items.push(result.value);
  }
  return { items, skipped: unique.length - items.length };
}
