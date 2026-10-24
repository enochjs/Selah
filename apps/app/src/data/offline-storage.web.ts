import type { OfflinePort } from "../domain/download-manager";
import { DownloadFailure } from "../domain/download-manager";
import { resourceUrl } from "../config/resources";
import { offlineMetadata } from "./offline-metadata";

const urls = new Map<string, string>();
const cacheName = "selah-offline-audio-v1";
function cacheKey(hash: string) {
  return new URL("/__selah_offline__/" + hash + ".mp3", location.origin).href;
}
export function createOfflinePort(): OfflinePort {
  return {
    ...offlineMetadata(),
    availableBytes: async () => {
      const estimate = await navigator.storage?.estimate();
      return estimate?.quota !== undefined
        ? Math.max(0, estimate.quota - (estimate.usage ?? 0))
        : null;
    },
    exists: async (asset) => {
      const response = await (
        await caches.open(cacheName)
      ).match(cacheKey(asset.sha256));
      return response?.headers.get("content-length") === String(asset.size);
    },
    resolve: async (asset) => {
      if (urls.has(asset.sha256)) return urls.get(asset.sha256)!;
      const response = await (
        await caches.open(cacheName)
      ).match(cacheKey(asset.sha256));
      if (!response) throw new DownloadFailure("unavailable");
      const url = URL.createObjectURL(await response.blob());
      urls.set(asset.sha256, url);
      return url;
    },
    remove: async (asset) => {
      await (await caches.open(cacheName)).delete(cacheKey(asset.sha256));
      // Existing media elements retain their blob URL until this browser session ends.
      urls.delete(asset.sha256);
    },
    async download(asset, signal, progress) {
      const url = resourceUrl(asset.path);
      if (!url) throw new DownloadFailure("unavailable");
      const response = await fetch(url, { signal }).catch(() => {
        throw new DownloadFailure("network");
      });
      if (!response.ok)
        throw new DownloadFailure(
          response.status === 404 ? "unavailable" : "network",
        );
      const reader = response.body?.getReader();
      if (!reader) throw new DownloadFailure("download");
      const chunks: Uint8Array<ArrayBuffer>[] = [];
      let bytes = 0;
      while (true) {
        const result = await reader.read().catch(() => {
          throw new DownloadFailure("network");
        });
        if (result.done) break;
        chunks.push(result.value);
        bytes += result.value.byteLength;
        progress(bytes);
      }
      if (signal.aborted) throw new DownloadFailure("network");
      const blob = new Blob(chunks, { type: "audio/mpeg" });
      if (bytes !== asset.size) throw new DownloadFailure("integrity");
      const hash = await crypto.subtle.digest(
        "SHA-256",
        await blob.arrayBuffer(),
      );
      const actual = [...new Uint8Array(hash)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      if (actual !== asset.sha256) throw new DownloadFailure("integrity");
      await (
        await caches.open(cacheName)
      )
        .put(
          cacheKey(asset.sha256),
          new Response(blob, {
            headers: {
              "content-length": String(bytes),
              "content-type": "audio/mpeg",
            },
          }),
        )
        .catch((error: unknown) => {
          throw new DownloadFailure(
            error instanceof DOMException && error.name === "QuotaExceededError"
              ? "storage"
              : "download",
          );
        });
      return { ...asset, uri: "offline:" + asset.sha256 };
    },
  };
}
