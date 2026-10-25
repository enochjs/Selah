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
function failure(error: unknown) {
  return error instanceof DownloadFailure
    ? error
    : new DownloadFailure(
        error instanceof Error &&
          /ENOSPC|quota|no space left|disk full/i.test(error.message)
          ? "storage"
          : "network",
      );
}
async function recover(asset: DownloadAsset, signal: AbortSignal) {
  try {
    if (signal.aborted) throw new DownloadFailure("network");
    const final = destination(asset.sha256);
    if (!final.exists) return null;
    try {
      await verify(final, asset);
    } catch (error) {
      if (!(error instanceof DownloadFailure) || error.code !== "integrity")
        throw error;
      if (signal.aborted) throw new DownloadFailure("network");
      final.delete();
      return null;
    }
    if (signal.aborted) throw new DownloadFailure("network");
    return { ...asset, uri: "offline:" + asset.sha256 };
  } catch (error) {
    throw failure(error);
  }
}
export function createOfflinePort(): OfflinePort {
  return {
    ...nativeOfflineMetadata(),
    recover,
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
      try {
        const recovered = await recover(asset, signal);
        if (recovered) return recovered;
        const url = resourceUrl(asset.path);
        if (!url) throw new DownloadFailure("unavailable");
        directory().create({ idempotent: true, intermediates: true });
        const final = destination(asset.sha256),
          partial = destination(asset.sha256, ".part"),
          resume = destination(asset.sha256, ".resume");
        const stored = { ...asset, uri: "offline:" + asset.sha256 };
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
          throw error;
        } finally {
          signal.removeEventListener("abort", abort);
          if (pausing) await pausing;
        }
      } catch (error) {
        throw failure(error);
      }
    },
  };
}
