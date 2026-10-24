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
export interface OfflinePort {
  read(): Promise<OfflineSnapshot | null>;
  write(snapshot: OfflineSnapshot): Promise<void>;
  availableBytes(): Promise<number | null>;
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
    activePath: null,
    activeBytes: 0,
    network: "unknown",
  };
  private writes = Promise.resolve();
  private running = false;
  private controller: AbortController | null = null;
  private activeKey: string | null = null;
  private activeJob: Promise<void> | null = null;
  constructor(
    private readonly port: OfflinePort,
    private readonly changed: (state: OfflineState) => void,
  ) {}
  getSnapshot = () => this.state;
  private change(patch: Partial<OfflineState>) {
    this.state = { ...this.state, ...patch };
    this.changed(this.state);
  }
  private persist() {
    const snapshot: OfflineSnapshot = {
      chapters: this.state.chapters,
      assets: this.state.assets,
      wifiOnly: this.state.wifiOnly,
    };
    this.writes = this.writes
      .catch(() => {})
      .then(() => this.port.write(snapshot));
    return this.writes;
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
    if (chapter)
      this.change({
        chapters: { ...this.state.chapters, [key]: { ...chapter, ...patch } },
      });
  }
  async initialize(): Promise<void> {
    const saved = await this.port.read();
    const assets: OfflineState["assets"] = {};
    const entries = Object.values(saved?.assets ?? {});
    for (let index = 0; index < entries.length; index += 16) {
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
    for (const path of paths) delete assets[path];
    const chapters = { ...this.state.chapters };
    for (const [key, chapter] of Object.entries(chapters))
      if (
        chapter.status === "complete" &&
        chapter.files.some((file) => paths.has(file.path))
      )
        chapters[key] = { ...chapter, status: "failed", error: "unavailable" };
    this.change({ assets, chapters });
  }
  async prepare(chapters: OfflineChapter[]): Promise<DownloadPlan> {
    const paths = [
      ...new Set(
        chapters.flatMap((chapter) => chapter.files.map((file) => file.path)),
      ),
    ];
    const missing = new Set<string>();
    for (let index = 0; index < paths.length; index += 16)
      await Promise.all(
        paths.slice(index, index + 16).map(async (path) => {
          const asset = this.state.assets[path];
          if (asset && !(await this.port.exists(asset))) missing.add(path);
        }),
      );
    this.invalidate(missing);
    if (missing.size) await this.persist();
    return createDownloadPlan(
      chapters,
      this.state.assets,
      await this.port.availableBytes(),
    );
  }
  async enqueue(plan: DownloadPlan, wifiOnly: boolean): Promise<void> {
    const { bytes, availableBytes: free } = await this.prepare(plan.chapters);
    if (free !== null && bytes > free) throw new DownloadFailure("storage");
    const chapters = { ...this.state.chapters };
    for (const chapter of plan.chapters) {
      if (chapters[chapter.key]?.status === "downloading") continue;
      const complete = chapter.files.every(
        (file) => this.state.assets[file.path]?.sha256 === file.sha256,
      );
      chapters[chapter.key] = {
        ...chapter,
        status: complete ? "complete" : "queued",
      };
    }
    this.change({ chapters, wifiOnly });
    this.updateWaiting();
    await this.persist();
    void this.work();
  }
  async pause(keys: string[]): Promise<void> {
    const chapters = { ...this.state.chapters };
    for (const key of keys)
      if (chapters[key] && chapters[key].status !== "complete")
        chapters[key] = { ...chapters[key], status: "paused" };
    this.change({ chapters });
    if (this.activeKey && keys.includes(this.activeKey)) {
      this.controller?.abort();
      await this.activeJob;
    }
    await this.persist();
  }
  async resume(keys: string[]): Promise<void> {
    const chapters = { ...this.state.chapters };
    for (const key of keys)
      if (chapters[key] && chapters[key].status !== "complete")
        chapters[key] = {
          ...chapters[key],
          status: "queued",
          error: undefined,
        };
    this.change({ chapters });
    this.updateWaiting();
    await this.persist();
    void this.work();
  }
  async remove(keys: string[]): Promise<void> {
    await this.pause(keys);
    const removing = keys.flatMap(
      (key) => this.state.chapters[key]?.files ?? [],
    );
    const chapters = { ...this.state.chapters };
    for (const key of keys) delete chapters[key];
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
      this.change({ assets });
    }
    await this.persist();
  }
  private updateWaiting() {
    const chapters = { ...this.state.chapters };
    for (const [key, chapter] of Object.entries(this.state.chapters)) {
      if (["queued", "waiting", "downloading"].includes(chapter.status))
        chapters[key] = {
          ...chapter,
          status: this.allowed()
            ? chapter.status === "downloading"
              ? "downloading"
              : "queued"
            : "waiting",
        };
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
    void this.work();
  }
  private async work() {
    if (this.running || !this.state.ready || !this.allowed()) return;
    this.running = true;
    try {
      while (this.allowed()) {
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
      this.change({ activePath: null, activeBytes: 0 });
    }
  }
  private async downloadChapter(
    chapter: OfflineChapter,
    controller: AbortController,
  ) {
    try {
      this.chapter(chapter.key, { status: "downloading", error: undefined });
      await this.persist();
      for (const file of chapter.files) {
        if (controller.signal.aborted) return;
        const cached = this.state.assets[file.path];
        if (cached?.sha256 === file.sha256) {
          if (await this.port.exists(cached)) continue;
          this.invalidate(new Set([file.path]));
        }
        const available = await this.port.availableBytes();
        if (available !== null && available < file.size)
          throw new DownloadFailure("storage");
        this.change({ activePath: file.path, activeBytes: 0 });
        const asset = await this.port.download(
          file,
          controller.signal,
          (bytes) => {
            if (!controller.signal.aborted)
              this.change({
                activeBytes: Math.max(0, Math.min(file.size, bytes)),
              });
          },
        );
        if (asset.sha256 !== file.sha256 || asset.size !== file.size)
          throw new DownloadFailure("integrity");
        this.change({
          assets: { ...this.state.assets, [file.path]: asset },
          activePath: null,
          activeBytes: 0,
        });
        await this.persist();
      }
      if (
        !controller.signal.aborted &&
        this.state.chapters[chapter.key]?.status === "downloading"
      )
        this.chapter(chapter.key, { status: "complete" });
    } catch (error) {
      if (!controller.signal.aborted)
        this.chapter(chapter.key, {
          status: "failed",
          error: error instanceof DownloadFailure ? error.code : "download",
        });
    } finally {
      await this.persist().catch(() => {
        this.chapter(chapter.key, { status: "failed", error: "storage" });
      });
    }
  }
  async resolveSource(
    source: AudioTrack["source"],
  ): Promise<AudioTrack["source"]> {
    if (typeof source === "number") return source;
    let path: string;
    try {
      path = new URL(source.uri).pathname;
    } catch {
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
