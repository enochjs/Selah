import { createReadStream } from "node:fs";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { Inject, Injectable } from "@nestjs/common";
import { SERVER_OPTIONS, type ServerOptions } from "../common/options";
import { missing, readJson } from "../infrastructure/json-file";
import type { MediaFile } from "../media/media.types";

interface PublishedLesson {
  id: string;
  sha256: string;
}

const digest = /^[a-f0-9]{64}$/;

function isPublishedLesson(input: unknown): input is PublishedLesson {
  return (
    typeof input === "object" &&
    input !== null &&
    "id" in input &&
    typeof input.id === "string" &&
    "sha256" in input &&
    typeof input.sha256 === "string" &&
    digest.test(input.sha256)
  );
}

@Injectable()
export class EnglishLessonsRepository {
  private readonly root: string;

  constructor(@Inject(SERVER_OPTIONS) options: ServerOptions) {
    this.root = path.join(options.mediaRoot, "english-lessons");
  }

  async catalog(): Promise<PublishedLesson[]> {
    try {
      const value = await readJson<{ version: unknown; lessons: unknown }>(
        path.join(this.root, "catalog.json"),
      );
      if (value.version !== 1 || !Array.isArray(value.lessons)) {
        throw new Error("Invalid English lesson catalog");
      }
      return value.lessons.filter(isPublishedLesson);
    } catch (error) {
      if (missing(error)) return [];
      throw error;
    }
  }

  async video(sha256: string): Promise<MediaFile | null> {
    if (!digest.test(sha256)) return null;
    const file = path.join(this.root, `${sha256}.mp4`);
    try {
      const info = await lstat(file);
      if (!info.isFile() || info.size === 0) return null;
      return {
        size: info.size,
        mtime: info.mtime,
        mtimeMs: info.mtimeMs,
        stream: (start, end) => createReadStream(file, { start, end }),
      };
    } catch (error) {
      if (missing(error)) return null;
      throw error;
    }
  }
}
