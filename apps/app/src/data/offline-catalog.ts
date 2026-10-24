import recordings from "@selah/content/chapter-audio.json";
import { bibleRepository } from "./bible-repository";
import type { ChapterRecording, Locale } from "../domain/models";
import type {
  DownloadAsset,
  DownloadScope,
  OfflineChapter,
} from "../domain/offline-audio";
import { DownloadFailure } from "../domain/download-manager";

export interface DownloadManifest {
  version: 1;
  files: DownloadAsset[];
  recordings?: Record<string, ChapterRecording>;
}
export function parseDownloadManifest(input: unknown): DownloadManifest {
  if (
    !input ||
    typeof input !== "object" ||
    !("version" in input) ||
    input.version !== 1 ||
    !("files" in input) ||
    !Array.isArray(input.files)
  )
    throw new DownloadFailure("unavailable");
  const files: DownloadAsset[] = [];
  for (const value of input.files as unknown[]) {
    if (
      !value ||
      typeof value !== "object" ||
      !("path" in value) ||
      typeof value.path !== "string" ||
      !("size" in value) ||
      typeof value.size !== "number" ||
      !Number.isSafeInteger(value.size) ||
      value.size <= 0 ||
      !("sha256" in value) ||
      typeof value.sha256 !== "string" ||
      !/^\/api\/audio\/(resources|aligned)\/[a-f0-9]{64}\.mp3$/.test(
        value.path,
      ) ||
      value.path.split("/").pop() !== value.sha256 + ".mp3"
    )
      throw new DownloadFailure("unavailable");
    files.push({ path: value.path, size: value.size, sha256: value.sha256 });
  }
  const catalog =
    "recordings" in input &&
    input.recordings &&
    typeof input.recordings === "object"
      ? (input.recordings as Record<string, ChapterRecording>)
      : undefined;
  return { version: 1, files, ...(catalog ? { recordings: catalog } : {}) };
}
export function offlineChapters(
  scope: DownloadScope,
  locale: Locale,
  manifest: DownloadManifest,
): OfflineChapter[] {
  const files = new Map(manifest.files.map((file) => [file.path, file]));
  const catalog =
    manifest.recordings ??
    (recordings as unknown as Record<string, ChapterRecording>);
  const chapters: OfflineChapter[] = [];
  for (const book of bibleRepository.listBooks()) {
    if (
      (scope.kind === "old" && book.testament !== "old") ||
      (scope.kind === "new" && book.testament !== "new") ||
      ((scope.kind === "book" || scope.kind === "chapter") &&
        scope.bookId !== book.id)
    )
      continue;
    for (let index = 0; index < book.chapters.length; index++) {
      const chapter = index + 1;
      if (scope.kind === "chapter" && scope.chapter !== chapter) continue;
      const key = `${book.id}:${chapter}:${locale}`;
      const recording = catalog[key];
      if (
        !recording ||
        !Array.isArray(recording.segments) ||
        !Number.isFinite(recording.duration)
      )
        throw new DownloadFailure("unavailable");
      const paths = [
        ...new Set([
          recording.path,
          ...(recording.verseFiles ?? []).map((verse) => verse.path),
        ]),
      ];
      const required = paths.map((path) => {
        const file = files.get(path);
        if (!file) throw new DownloadFailure("unavailable");
        return file;
      });
      chapters.push({
        key,
        bookId: book.id,
        chapter,
        locale,
        recording,
        files: required,
      });
    }
  }
  if (!chapters.length) throw new DownloadFailure("unavailable");
  return chapters;
}
