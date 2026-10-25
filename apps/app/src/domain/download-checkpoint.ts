import type { OfflineChanges, OfflineSnapshot } from "./download-manager";

/** Serialize durable checkpoints; file bytes remain recoverable between checkpoints. */
export class DownloadCheckpoint {
  private chapters = new Set<string>();
  private assets = new Set<string>();
  private settings = false;
  private count = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly snapshot: () => OfflineSnapshot,
    private readonly write: (
      snapshot: OfflineSnapshot,
      changes: OfflineChanges,
    ) => Promise<void>,
    private readonly failed: () => void,
  ) {}
  chapter(key: string) {
    this.chapters.add(key);
  }
  asset(path: string) {
    this.assets.add(path);
  }
  configuration() {
    this.settings = true;
  }
  completed() {
    this.count++;
    if (this.count >= 8) this.save();
    else this.schedule();
  }
  schedule() {
    this.timer ??= setTimeout(() => this.save(), 500);
  }
  private save() {
    void this.flush().catch(this.failed);
  }
  flush(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.writes = this.writes
      .catch(() => {})
      .then(async () => {
        if (!this.settings && !this.chapters.size && !this.assets.size) return;
        const changes = {
          chapters: [...this.chapters],
          assets: [...this.assets],
        };
        this.chapters.clear();
        this.assets.clear();
        this.settings = false;
        this.count = 0;
        try {
          await this.write(this.snapshot(), changes);
        } catch (error) {
          changes.chapters.forEach((key) => this.chapters.add(key));
          changes.assets.forEach((path) => this.assets.add(path));
          this.settings = true;
          throw error;
        }
      });
    return this.writes;
  }
}
