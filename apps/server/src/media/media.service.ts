import { Inject, Injectable } from "@nestjs/common";
import { ContentRepository } from "../infrastructure/content.repository";
import type { AudioDownloadManifest, Recording } from "../domain/models";
import { MediaRepository } from "./media.repository";
import { immutableMedia, mediaResponse } from "./media-response";
import type {
  MediaAddress,
  MediaRequest,
  MediaResponsePlan,
} from "./media.types";

@Injectable()
export class MediaService {
  constructor(
    @Inject(MediaRepository) private readonly repository: MediaRepository,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {}

  async downloadManifest(mode?: "chapter"): Promise<AudioDownloadManifest> {
    const catalog =
      await this.content.read<Record<string, Recording>>("chapter-audio.json");
    const paths = new Set<string>();
    for (const recording of Object.values(catalog)) {
      if (!recording || typeof recording !== "object") continue;
      if (typeof recording.path === "string") paths.add(recording.path);
      if (mode !== "chapter" && Array.isArray(recording.verseFiles))
        for (const verse of recording.verseFiles)
          if (typeof verse?.path === "string") paths.add(verse.path);
    }
    const files: AudioDownloadManifest["files"] = [];
    const resourcePaths = [...paths];
    const metadataConcurrency = 8;
    for (
      let offset = 0;
      offset < resourcePaths.length;
      offset += metadataConcurrency
    ) {
      const batch = await Promise.all(
        resourcePaths
          .slice(offset, offset + metadataConcurrency)
          .map(async (resourcePath) => {
            // Only imported, content-addressed MP3s have a trusted expected digest.
            const match = resourcePath.match(
              /^\/api\/audio\/(resources|aligned)\/([a-f0-9]{64})\.mp3$/,
            );
            if (!match) return undefined;
            const metadata = await this.repository.downloadMetadata({
              kind: match[1],
              name: `${match[2]}.mp3`,
            });
            return metadata
              ? { path: resourcePath, size: metadata.size, sha256: match[2] }
              : undefined;
          }),
      );
      for (const file of batch) if (file) files.push(file);
    }
    const availablePaths = new Set(files.map((file) => file.path));
    const recordings = Object.fromEntries(
      Object.entries(catalog).filter(
        ([, recording]) =>
          recording &&
          typeof recording === "object" &&
          typeof recording.path === "string" &&
          availablePaths.has(recording.path) &&
          (mode === "chapter" ||
            recording.verseFiles === undefined ||
            (Array.isArray(recording.verseFiles) &&
              recording.verseFiles.every(
                (verse) =>
                  typeof verse?.path === "string" &&
                  availablePaths.has(verse.path),
              ))),
      ),
    );
    return { version: 1, files, recordings };
  }

  async prepare(
    address: MediaAddress,
    request: MediaRequest,
  ): Promise<MediaResponsePlan> {
    const file = await this.repository.open(address);
    return mediaResponse(
      file,
      request,
      "audio/mpeg",
      address.kind === "bible" ? "public, max-age=3600" : immutableMedia,
    );
  }
}
