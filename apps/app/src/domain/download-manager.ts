import { DownloadCheckpoint } from "./download-checkpoint";
import type { AudioTrack } from "./models";
import type {
  DownloadAsset,
  DownloadPlan,
  OfflineChapter,
  OfflineState,
  StoredAudioAsset,
} from "./offline-audio";

export type OfflineSnapshot = Pick<
  OfflineState,
  "chapters" | "assets" | "wifiOnly"
>;
export interface OfflineChanges {
  chapters: string[];
  assets: string[];
}
export interface OfflinePort {
  read(): Promise<OfflineSnapshot | null>;
  write(snapshot: OfflineSnapshot, changes?: OfflineChanges): Promise<void>;
  availableBytes(): Promise<number | null>;
  recover?(
    asset: DownloadAsset,
    signal: AbortSignal,
  ): Promise<StoredAudioAsset | null>;
  exists(asset: StoredAudioAsset): Promise<boolean>;
  download(
    asset: DownloadAsset,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<StoredAudioAsset>;
  resolve(asset: StoredAudioAsset): Promise<string>;
  remove(asset: StoredAudioAsset): Promise<void>;
}

export class DownloadFailure extends Error {
  constructor(
    public readonly code:
      "network" | "storage" | "integrity" | "unavailable" | "download",
  ) {
    super(code);
  }
}

export function createDownloadPlan(
  chapters: OfflineChapter[],
  assets: OfflineState["assets"],
  availableBytes: number | null,
): DownloadPlan {
  const files = new Map(
    chapters
      .flatMap((chapter) => chapter.files)
      .map((file) => [file.path, file]),
  );
  const totalBytes = [...files.values()].reduce(
    (sum, file) => sum + file.size,
    0,
  );
  const bytes = [...files.values()]
    .filter((file) => assets[file.path]?.sha256 !== file.sha256)
    .reduce((sum, file) => sum + file.size, 0);
  return { chapters, bytes, totalBytes, availableBytes };
}

export class DownloadManager {
  private state: OfflineState = {
    ready: false,
    chapters: {},
    assets: {},
    wifiOnly: true,
    transfers: {},
    network: "unknown",
  };
  private readonly checkpoint: DownloadCheckpoint;
  private readonly concurrency: number;
  private transfers: Record<string, number> = {};
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private storageFailed = false;
  private operations: Promise<void> = Promise.resolve();
  private initialization: Promise<void> | null = null;
  private running = false;
  private controller: AbortController | null = null;
  private activeKey: string | null = null;
  private activeJob: Promise<void> | null = null;
  constructor(
    private readonly port: OfflinePort,
    private readonly changed: (state: OfflineState) => void,
    options: { concurrency?: number } = {},
  ) {
    this.concurrency = Math.max(
      1,
      Math.min(8, Math.floor(options.concurrency ?? 4) || 4),
    );
    this.checkpoint = new DownloadCheckpoint(
      () => ({
        chapters: this.state.chapters,
        assets: this.state.assets,
        wifiOnly: this.state.wifiOnly,
      }),
      (snapshot, changes) => this.port.write(snapshot, changes),
      () => this.persistenceFailed(),
    );
  }
  getSnapshot = () => this.state;
  private change(patch: Partial<OfflineState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  private persist() {
    return this.checkpoint.flush();
  }
  flush = async (): Promise<void> => {
    try {
      await this.persist();
    } catch (error) {
      this.persistenceFailed();
      throw error;
    }
  };
  private persistenceFailed() {
    this.storageFailed = true;
    this.controller?.abort();
    if (this.activeKey)
      this.chapter(this.activeKey, { status: "failed", error: "storage" });
  }
  private publishProgress() {
    if (this.progressTimer !== null) clearTimeout(this.progressTimer);
    this.progressTimer = null;
    this.change({ transfers: { ...this.transfers } });
  }
  private progress(path: string, bytes: number) {
    this.transfers[path] = bytes;
    this.progressTimer ??= setTimeout(() => this.publishProgress(), 200);
  }
  private allowed() {
    return (
      this.state.network === "wifi" ||
      (!this.state.wifiOnly && this.state.network !== "offline")
    );
  }
  private chapter(
    key: string,
    patch: Partial<OfflineState["chapters"][string]>,
  ) {
    const chapter = this.state.chapters[key];
    if (chapter) {
      this.checkpoint.chapter(key);
      this.change({
        chapters: { ...this.state.chapters, [key]: { ...chapter, ...patch } },
      });
    }
  }
  initialize(): Promise<void> {
    this.initialization ??= this.initializeNow().catch((error: unknown) => {
      this.initialization = null;
      this.change({ ready: false });
      throw error;
    });
    return this.initialization;
  }
  private async initializeNow(): Promise<void> {
    const saved = await this.port.read();
    const assets: OfflineState["assets"] = {};
    const entries = Object.values(saved?.assets ?? {});
    for (let index = 0; index < entries.length; index += 16) {
      // Native file properties can be synchronous; let screens render and respond.
      if (index > 0)
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      await Promise.all(
        entries.slice(index, index + 16).map(async (asset) => {
          if (await this.port.exists(asset)) assets[asset.path] = asset;
        }),
      );
    }
    const chapters = Object.fromEntries(
      Object.entries(saved?.chapters ?? {}).map(([key, chapter]) => {
        const complete = chapter.files.every(
          (file) => assets[file.path]?.sha256 === file.sha256,
        );
        const status =
          chapter.status === "complete"
            ? complete
              ? "complete"
              : "failed"
            : chapter.status === "failed"
              ? "failed"
              : "paused";
        return [
          key,
          {
            ...chapter,
            status,
            ...(!complete && chapter.status === "complete"
              ? { error: "unavailable" as const }
              : {}),
          },
        ];
      }),
    ) as OfflineState["chapters"];
    for (const key of Object.keys(saved?.chapters ?? {}))
      this.checkpoint.chapter(key);
    for (const path of Object.keys(saved?.assets ?? {}))
      this.checkpoint.asset(path);
    this.checkpoint.configuration();
    this.change({
      ready: true,
      chapters,
      assets,
      wifiOnly: saved?.wifiOnly ?? true,
    });
    await this.persist();
  }
  private invalidate(paths: Set<string>) {
    if (!paths.size) return;
    const assets = { ...this.state.assets };
    for (const path of paths) {
      delete assets[path];
      this.checkpoint.asset(path);
    }
    const chapters = { ...this.state.chapters };
    for (const [key, chapter] of Object.entries(chapters))
      if (
        chapter.status === "complete" &&
        chapter.files.some((file) => paths.has(file.path))
      ) {
        chapters[key] = { ...chapter, status: "failed", error: "unavailable" };
        this.checkpoint.chapter(key);
      }
    this.change({ assets, chapters });
  }
  private register(file: DownloadAsset, asset: StoredAudioAsset) {
    if (asset.sha256 !== file.sha256 || asset.size !== file.size)
      throw new DownloadFailure("integrity");
    this.checkpoint.asset(file.path);
    this.change({ assets: { ...this.state.assets, [file.path]: asset } });
  }
  prepare(chapters: OfflineChapter[]): Promise<DownloadPlan> {
    return this.operate(() => this.prepareNow(chapters));
  }
  private async prepareNow(chapters: OfflineChapter[]): Promise<DownloadPlan> {
    const files = [
      ...new Map(
        chapters.flatMap((chapter) =>
          chapter.files.map((file) => [file.path, file] as const),
        ),
      ).values(),
    ];
    // Only persisted chapters can contain an interrupted, uncheckpointed batch.
    const recoverable = new Set(
      chapters.flatMap(
        (chapter) =>
          this.state.chapters[chapter.key]?.files.map((file) => file.path) ??
          [],
      ),
    );
    const missing = new Set<string>();
    const recovered = new Map<DownloadAsset, StoredAudioAsset>();
    const signal = new AbortController().signal;
    for (let index = 0; index < files.length; index += 16)
      await Promise.all(
        files.slice(index, index + 16).map(async (file) => {
          const cached = this.state.assets[file.path];
          if (
            cached?.sha256 === file.sha256 &&
            (await this.port.exists(cached))
          )
            return;
          if (cached) missing.add(file.path);
          if (recoverable.has(file.path)) {
            const asset = await this.port.recover?.(file, signal);
            if (asset) recovered.set(file, asset);
          }
        }),
      );
    this.invalidate(missing);
    for (const [file, asset] of recovered) this.register(file, asset);
    if (missing.size || recovered.size) await this.persist();
    return createDownloadPlan(
      chapters,
      this.state.assets,
      await this.port.availableBytes(),
    );
  }
  private operate<T>(action: () => Promise<T>): Promise<T> {
    const operation = this.operations.then(async () => {
      await this.initialize();
      return action();
    });
    this.operations = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
  enqueue(plan: DownloadPlan, wifiOnly: boolean): Promise<void> {
    return this.operate(() => this.enqueueNow(plan, wifiOnly));
  }
  pause(keys: string[]): Promise<void> {
    return this.operate(() => this.pauseNow(keys));
  }
  resume(keys: string[]): Promise<void> {
    return this.operate(() => this.resumeNow(keys));
  }
  remove(keys: string[]): Promise<void> {
    return this.operate(() => this.removeNow(keys));
  }
  private async enqueueNow(
    plan: DownloadPlan,
    wifiOnly: boolean,
  ): Promise<void> {
    const { bytes, availableBytes: free } = await this.prepareNow(
      plan.chapters,
    );
    if (free !== null && bytes > free) throw new DownloadFailure("storage");
    const chapters = { ...this.state.chapters };
    for (const chapter of plan.chapters) {
      if (chapters[chapter.key]?.status === "downloading") continue;
      const complete = chapter.files.every(
        (file) => this.state.assets[file.path]?.sha256 === file.sha256,
      );
      this.checkpoint.chapter(chapter.key);
      chapters[chapter.key] = {
        ...chapter,
        status: complete ? "complete" : "queued",
      };
    }
    this.storageFailed = false;
    this.checkpoint.configuration();
    this.change({ chapters, wifiOnly });
    this.updateWaiting();
    await this.persist();
    void this.work();
  }
  private async pauseNow(keys: string[]): Promise<void> {
    const chapters = { ...this.state.chapters };
    for (const key of keys)
      if (chapters[key] && chapters[key].status !== "complete") {
        chapters[key] = { ...chapters[key], status: "paused" };
        this.checkpoint.chapter(key);
      }
    this.change({ chapters });
    if (this.activeKey && keys.includes(this.activeKey)) {
      this.controller?.abort();
      await this.activeJob;
    }
    await this.persist();
  }
  private async resumeNow(keys: string[]): Promise<void> {
    const chapters = { ...this.state.chapters };
    for (const key of keys)
      if (chapters[key] && chapters[key].status !== "complete") {
        chapters[key] = {
          ...chapters[key],
          status: "queued",
          error: undefined,
        };
        this.checkpoint.chapter(key);
      }
    this.storageFailed = false;
    this.change({ chapters });
    this.updateWaiting();
    await this.persist();
    void this.work();
  }
  private async removeNow(keys: string[]): Promise<void> {
    await this.pauseNow(keys);
    const removing = keys.flatMap(
      (key) => this.state.chapters[key]?.files ?? [],
    );
    const chapters = { ...this.state.chapters };
    for (const key of keys) {
      delete chapters[key];
      this.checkpoint.chapter(key);
    }
    this.change({ chapters });
    const candidates = new Map(
      [
        ...Object.values(this.state.assets),
        ...removing.map((file) => ({ ...file, uri: "offline:" + file.sha256 })),
      ].map((file) => [file.path, file]),
    );
    for (const asset of candidates.values()) {
      const retained = Object.values(this.state.chapters).some((chapter) =>
        chapter.files.some((file) => file.path === asset.path),
      );
      if (retained) continue;
      await this.port.remove(asset);
      const assets = { ...this.state.assets };
      delete assets[asset.path];
      this.checkpoint.asset(asset.path);
      this.change({ assets });
    }
    await this.persist();
  }
  private updateWaiting() {
    const chapters = { ...this.state.chapters };
    for (const [key, chapter] of Object.entries(this.state.chapters)) {
      if (["queued", "waiting", "downloading"].includes(chapter.status)) {
        this.checkpoint.chapter(key);
        chapters[key] = {
          ...chapter,
          status: this.allowed()
            ? chapter.status === "downloading"
              ? "downloading"
              : "queued"
            : "waiting",
        };
      }
    }
    this.change({ chapters });
    if (!this.allowed()) this.controller?.abort();
  }
  setNetwork(network: OfflineState["network"]): void {
    const chapters = { ...this.state.chapters };
    if (network === "offline")
      for (const [key, chapter] of Object.entries(chapters))
        if (chapter.status === "failed" && chapter.error === "network")
          chapters[key] = { ...chapter, status: "waiting", error: undefined };
    this.change({ network, chapters });
    this.updateWaiting();
    this.checkpoint.schedule();
    void this.work();
  }
  private async work() {
    if (this.running || !this.state.ready || !this.allowed()) return;
    this.running = true;
    try {
      while (this.allowed() && !this.storageFailed) {
        const chapter = Object.values(this.state.chapters).find(
          (chapter) => chapter.status === "queued",
        );
        if (!chapter) break;
        const controller = new AbortController();
        this.controller = controller;
        this.activeKey = chapter.key;
        this.activeJob = this.downloadChapter(chapter, controller);
        await this.activeJob;
      }
    } finally {
      this.running = false;
      this.controller = null;
      this.activeKey = null;
      this.activeJob = null;
      this.transfers = {};
      this.publishProgress();
    }
  }
  private async downloadChapter(
    chapter: OfflineChapter,
    controller: AbortController,
  ) {
    let failure: unknown;
    let remainingCapacity: number | null = null;
    let cursor = 0;
    const files = [
      ...new Map(chapter.files.map((file) => [file.path, file])).values(),
    ];
    const worker = async () => {
      try {
        while (!controller.signal.aborted && cursor < files.length) {
          const file = files[cursor++];
          const cached = this.state.assets[file.path];
          if (cached?.sha256 === file.sha256) {
            if (await this.port.exists(cached)) continue;
            this.invalidate(new Set([file.path]));
          }
          const recovered = await this.port.recover?.(file, controller.signal);
          if (controller.signal.aborted) return;
          if (recovered) {
            this.register(file, recovered);
            this.checkpoint.completed();
            continue;
          }
          // A fixed chapter budget avoids counting growing partial files twice.
          // External space changes are still handled by the adapter's storage errors.
          if (remainingCapacity !== null) {
            if (remainingCapacity < file.size)
              throw new DownloadFailure("storage");
            remainingCapacity -= file.size;
          }
          this.transfers[file.path] = 0;
          try {
            const asset = await this.port.download(
              file,
              controller.signal,
              (bytes) => {
                if (!controller.signal.aborted)
                  this.progress(
                    file.path,
                    Math.max(0, Math.min(file.size, bytes)),
                  );
              },
            );
            // A verified file remains reusable if pause arrives during its final move.
            this.register(file, asset);
            this.checkpoint.completed();
          } finally {
            delete this.transfers[file.path];
            this.publishProgress();
          }
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          failure = error;
          controller.abort();
        }
      }
    };
    try {
      this.chapter(chapter.key, { status: "downloading", error: undefined });
      await this.persist();
      remainingCapacity = await this.port.availableBytes();
      await Promise.all(
        Array.from(
          { length: Math.min(this.concurrency, files.length) },
          worker,
        ),
      );
      if (this.storageFailed)
        this.chapter(chapter.key, { status: "failed", error: "storage" });
      else if (failure)
        this.chapter(chapter.key, {
          status: "failed",
          error: failure instanceof DownloadFailure ? failure.code : "download",
        });
      else if (
        !controller.signal.aborted &&
        this.state.chapters[chapter.key]?.status === "downloading"
      )
        this.chapter(chapter.key, { status: "complete" });
    } catch {
      this.persistenceFailed();
    } finally {
      await this.persist().catch(() => this.persistenceFailed());
    }
  }
  async resolveSource(
    source: AudioTrack["source"],
  ): Promise<AudioTrack["source"]> {
    if (typeof source === "number") return source;
    let path: string;
    try {
      const url = new URL(source.uri);
      if (url.protocol !== "http:" && url.protocol !== "https:") return source;
      path = url.pathname;
    } catch {
      return source;
    }
    try {
      await this.initialize();
    } catch {
      // Offline storage errors must not prevent streaming the original source.
      return source;
    }
    const asset = this.state.assets[path];
    if (!asset) return source;
    if (await this.port.exists(asset))
      return { uri: await this.port.resolve(asset) };
    this.invalidate(new Set([path]));
    await this.persist();
    return source;
  }
}
