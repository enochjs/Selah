import {
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  DownloadManager,
  createDownloadPlan,
  type OfflinePort,
} from "../src/domain/download-manager";
import type { DownloadManifest } from "../src/data/offline-catalog";
import type { OfflineChapter } from "../src/domain/offline-audio";

// Opt-in only: uses a temporary Node filesystem adapter, not an Expo device.
const base = process.env.SELAH_DOWNLOAD_BENCHMARK_URL;
it.skipIf(!base)(
  "measures real HTTP audio downloads at one and four concurrent files",
  async () => {
    const manifestStart = performance.now();
    const response = await fetch(new URL("/api/audio/download-manifest", base));
    expect(response.ok).toBe(true);
    const manifest = (await response.json()) as DownloadManifest;
    const manifestMs = performance.now() - manifestStart;
    const catalog = manifest.recordings!;
    const files = new Map(manifest.files.map((file) => [file.path, file]));
    const keys = [
      "psalms:23:en",
      "psalms:23:zh",
      "genesis:1:en",
      "genesis:1:zh",
    ];
    const scopes = keys.map((key) => [key]);
    if (process.env.SELAH_DOWNLOAD_BENCHMARK_BOOK === "1") {
      for (const locale of ["en", "zh"])
        scopes.push(
          Object.keys(catalog).filter(
            (key) => key.startsWith("genesis:") && key.endsWith(":" + locale),
          ),
        );
    }
    const results = [];
    for (const keys of scopes) {
      const chapters: OfflineChapter[] = keys.map((key) => {
        const recording = catalog[key];
        const [bookId, chapter, locale] = key.split(":");
        return {
          key,
          bookId,
          chapter: Number(chapter),
          locale: locale as "en" | "zh",
          recording,
          files: [
            ...new Set([
              recording.path,
              ...(recording.verseFiles ?? []).map((verse) => verse.path),
            ]),
          ].map((p) => files.get(p)!),
        };
      });
      for (const concurrency of [1, 4])
        for (let sample = 1; sample <= 3; sample++) {
          const root = await mkdtemp(
            path.join(tmpdir(), "selah-download-benchmark-"),
          );
          let networkMs = 0,
            verificationMs = 0,
            writes = 0;
          const filePath = (sha256: string) => path.join(root, sha256 + ".mp3");
          const port: OfflinePort = {
            read: async () => null,
            availableBytes: async () => null,
            write: async (snapshot) => {
              writes++;
              await writeFile(
                path.join(root, "index.tmp"),
                JSON.stringify(snapshot),
              );
              await rename(
                path.join(root, "index.tmp"),
                path.join(root, "index.json"),
              );
            },
            exists: async (asset) =>
              (await stat(filePath(asset.sha256)).catch(() => null))?.size ===
              asset.size,
            resolve: async (asset) => filePath(asset.sha256),
            remove: async (asset) =>
              rm(filePath(asset.sha256), { force: true }),
            download: async (asset, signal, progress) => {
              const started = performance.now();
              const response = await fetch(new URL(asset.path, base), {
                signal,
              });
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const bytes = await response.arrayBuffer();
              networkMs += performance.now() - started;
              const verifyStart = performance.now();
              const hash = Buffer.from(
                await crypto.subtle.digest("SHA-256", bytes),
              ).toString("hex");
              if (hash !== asset.sha256 || bytes.byteLength !== asset.size)
                throw new Error("Audio checksum mismatch");
              verificationMs += performance.now() - verifyStart;
              await writeFile(filePath(asset.sha256), new Uint8Array(bytes));
              progress(bytes.byteLength);
              return { ...asset, uri: filePath(asset.sha256) };
            },
          };
          const manager = new DownloadManager(port, () => {}, { concurrency });
          try {
            await manager.initialize();
            manager.setNetwork("wifi");
            const started = performance.now();
            const plan = createDownloadPlan(chapters, {}, null);
            await manager.enqueue(plan, true);
            while (
              Object.values(manager.getSnapshot().chapters).some((chapter) =>
                ["queued", "downloading"].includes(chapter.status),
              )
            )
              await new Promise((resolve) => setTimeout(resolve, 10));
            await manager.flush();
            expect(
              Object.values(manager.getSnapshot().chapters).every(
                (chapter) => chapter.status === "complete",
              ),
            ).toBe(true);
            // Validate the written checkpoint, not just the in-memory completion status.
            expect(
              JSON.parse(await readFile(path.join(root, "index.json"), "utf8"))
                .assets,
            ).toHaveProperty([chapters[0].files[0].path]);
            const result = {
              scope:
                keys.length === 1 ? keys[0] : `genesis:${chapters[0].locale}`,
              concurrency,
              sample,
              files: new Set(
                chapters.flatMap((chapter) =>
                  chapter.files.map((file) => file.path),
                ),
              ).size,
              bytes: plan.totalBytes,
              elapsedMs: Math.round(performance.now() - started),
              networkMs: Math.round(networkMs),
              verificationMs: Math.round(verificationMs),
              writes,
            };
            results.push(result);
            if (process.env.SELAH_DOWNLOAD_BENCHMARK_OUTPUT)
              await writeFile(
                process.env.SELAH_DOWNLOAD_BENCHMARK_OUTPUT,
                JSON.stringify(
                  { manifestMs: Math.round(manifestMs), results },
                  null,
                  2,
                ),
              );
            console.log(JSON.stringify({ audioBenchmark: result }));
          } finally {
            await manager.pause(keys);
            await rm(root, { recursive: true, force: true });
          }
        }
    }
    console.log(
      JSON.stringify({ manifestMs: Math.round(manifestMs), results }),
    );
  },
  600000,
);
