import { DownloadProgress } from "../domain/download-progress";
import type { OfflineState } from "../domain/offline-audio";

export interface DownloadBackgroundProgress {
  completed: number;
  total: number;
  percent: number;
  waiting: boolean;
}
export interface DownloadBackgroundPort {
  update(progress: DownloadBackgroundProgress): void;
  stop(): void;
}

/** Keep protection across files, chapter boundaries, and temporary network loss. */
export class DownloadBackgroundController {
  private signature: string | null = null;
  private readonly progress = new DownloadProgress();
  constructor(private readonly port: DownloadBackgroundPort) {}

  update(state: OfflineState): void {
    const chapters = Object.values(state.chapters);
    const pending = chapters.filter((chapter) =>
      ["queued", "downloading", "waiting"].includes(chapter.status),
    );
    if (!state.ready || !pending.length) {
      if (this.signature !== null) this.port.stop();
      this.signature = null;
      return;
    }
    const { totalBytes: total, receivedBytes: received } =
      this.progress.select(state);
    const progress: DownloadBackgroundProgress = {
      completed: chapters.filter((chapter) => chapter.status === "complete")
        .length,
      total: chapters.length,
      percent: total ? Math.floor((received / total) * 100) : 0,
      waiting: pending.every((chapter) => chapter.status === "waiting"),
    };
    const signature = JSON.stringify(progress);
    if (signature === this.signature) return;
    this.port.update(progress);
    this.signature = signature;
  }
}
