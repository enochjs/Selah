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
    const files = new Map(
      chapters.flatMap((chapter) =>
        chapter.files.map((file) => [file.path, file]),
      ),
    );
    let total = 0;
    let received = 0;
    for (const file of files.values()) {
      total += file.size;
      received +=
        state.assets[file.path]?.sha256 === file.sha256
          ? file.size
          : state.activePath === file.path
            ? Math.max(0, Math.min(file.size, state.activeBytes))
            : 0;
    }
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
