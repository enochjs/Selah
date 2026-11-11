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
