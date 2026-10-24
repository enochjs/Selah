import { Directory, File, Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import { digest, CryptoDigestAlgorithm } from "expo-crypto";
import type { OfflinePort } from "../domain/download-manager";
import { DownloadFailure } from "../domain/download-manager";
import type { DownloadAsset } from "../domain/offline-audio";
import { resourceUrl } from "../config/resources";
import { nativeOfflineMetadata } from "./offline-metadata-files";

const directory = () => new Directory(Paths.document, "selah-offline-audio");
function destination(sha256: string, suffix = ".mp3") {
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new DownloadFailure("integrity");
  return new File(directory(), sha256 + suffix);
}
async function verify(file: File, asset: DownloadAsset) {
  if (!file.exists || file.size !== asset.size)
    throw new DownloadFailure("integrity");
  const hash = await digest(CryptoDigestAlgorithm.SHA256, await file.bytes());
  const actual = [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (actual !== asset.sha256) throw new DownloadFailure("integrity");
}
export function createOfflinePort(): OfflinePort {
  return {
    ...nativeOfflineMetadata(),
    availableBytes: async () => Paths.availableDiskSpace,
    exists: async (asset) => {
      const file = destination(asset.sha256);
      return file.exists && file.size === asset.size;
    },
    resolve: async (asset) => destination(asset.sha256).uri,
    remove: async (asset) => {
      for (const suffix of [".mp3", ".part", ".resume"]) {
        const file = destination(asset.sha256, suffix);
        if (file.exists) file.delete();
      }
    },
    async download(asset, signal, progress) {
      const url = resourceUrl(asset.path);
      if (!url) throw new DownloadFailure("unavailable");
      directory().create({ idempotent: true, intermediates: true });
      const final = destination(asset.sha256),
        partial = destination(asset.sha256, ".part"),
        resume = destination(asset.sha256, ".resume");
      const stored = { ...asset, uri: "offline:" + asset.sha256 };
      if (final.exists) {
        try {
          await verify(final, asset);
          return stored;
        } catch {
          final.delete();
        }
      }
      const resumeData =
        resume.exists && partial.exists ? await resume.text() : undefined;
      if (!resumeData && partial.exists) partial.delete();
      const transfer = FileSystem.createDownloadResumable(
        url,
        partial.uri,
        {},
        (event) => progress(event.totalBytesWritten),
        resumeData,
      );
      let pausing: Promise<void> | null = null;
      const abort = () => {
        pausing = transfer
          .pauseAsync()
          .then(async (saved) => {
            if (saved.resumeData) await resume.write(saved.resumeData);
          })
          .catch(() => {});
      };
      signal.addEventListener("abort", abort, { once: true });
      try {
        if (signal.aborted) throw new DownloadFailure("network");
        const result = resumeData
          ? await transfer.resumeAsync()
          : await transfer.downloadAsync();
        if (signal.aborted) throw new DownloadFailure("network");
        if (!result || ![200, 206].includes(result.status))
          throw new DownloadFailure(
            result?.status === 404 ? "unavailable" : "network",
          );
        await verify(partial, asset);
        await partial.move(final);
        if (resume.exists) resume.delete();
        return stored;
      } catch (error) {
        if (!signal.aborted) {
          if (resume.exists) resume.delete();
          if (partial.exists) partial.delete();
        }
        throw error instanceof DownloadFailure
          ? error
          : new DownloadFailure("network");
      } finally {
        signal.removeEventListener("abort", abort);
        if (pausing) await pausing;
      }
    },
  };
}
