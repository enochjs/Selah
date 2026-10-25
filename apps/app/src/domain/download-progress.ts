import type { Locale } from "./models";
import type { DownloadAsset, OfflineState } from "./offline-audio";

export interface DownloadTotals {
  totalBytes: number;
  receivedBytes: number;
  storedBytes: number;
}
interface Selection {
  files: Map<string, DownloadAsset>;
  totalBytes: number;
  completedBytes: number;
}

/** Immutable snapshots let byte-only updates reuse file membership and durable totals. */
export class DownloadProgress {
  private chapters: OfflineState["chapters"] | null = null;
  private assets: OfflineState["assets"] | null = null;
  private selections = new Map<Locale | undefined, Selection>();
  private storedBytes = 0;

  select(state: OfflineState, locale?: Locale): DownloadTotals {
    if (state.chapters !== this.chapters) {
      this.chapters = state.chapters;
      this.selections.clear();
    }
    if (state.assets !== this.assets) {
      this.assets = state.assets;
      this.storedBytes = Object.values(state.assets).reduce(
        (sum, asset) => sum + asset.size,
        0,
      );
      for (const selection of this.selections.values())
        this.completed(selection, state);
    }
    let selection = this.selections.get(locale);
    if (!selection) {
      const files = new Map(
        Object.values(state.chapters)
          .filter(
            (chapter) => locale === undefined || chapter.locale === locale,
          )
          .flatMap((chapter) =>
            chapter.files.map((file) => [file.path, file] as const),
          ),
      );
      selection = {
        files,
        totalBytes: [...files.values()].reduce(
          (sum, file) => sum + file.size,
          0,
        ),
        completedBytes: 0,
      };
      this.completed(selection, state);
      this.selections.set(locale, selection);
    }
    let receivedBytes = selection.completedBytes;
    for (const [path, bytes] of Object.entries(state.transfers)) {
      const file = selection.files.get(path);
      if (file && state.assets[path]?.sha256 !== file.sha256)
        receivedBytes += Math.max(0, Math.min(file.size, bytes));
    }
    return {
      totalBytes: selection.totalBytes,
      receivedBytes,
      storedBytes: this.storedBytes,
    };
  }
  private completed(selection: Selection, state: OfflineState) {
    selection.completedBytes = 0;
    for (const file of selection.files.values())
      if (state.assets[file.path]?.sha256 === file.sha256)
        selection.completedBytes += file.size;
  }
}
