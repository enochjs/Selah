import { Inject, Injectable } from "@nestjs/common";
import path from "node:path";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  DailyVerseCatalog,
  parseDailyVerseCatalog,
} from "@selah/content/daily-verses";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { atomicJson, missing, readJson } from "../infrastructure/json-file";
@Injectable()
export class DailyVersesRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async read(): Promise<DailyVerseCatalog> {
    try {
      return parseDailyVerseCatalog(
        await readJson<unknown>(
          path.join(this.options.contentRoot, "daily-verses.json"),
        ),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      return { revision: 0, images: [], items: [] };
    }
  }
  async publish(previous: DailyVerseCatalog, next: DailyVerseCatalog) {
    const backup = `daily-verses-${Date.now()}-${previous.revision}.json`;
    await atomicJson(
      path.join(this.options.stateRoot, "backups", backup),
      previous,
    );
    await atomicJson(
      path.join(this.options.contentRoot, "daily-verses.json"),
      next,
    );
    return backup;
  }
  async store(file: string, bytes: Buffer) {
    const folder = path.join(this.options.stateRoot, "daily-verse-images");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    try {
      await writeFile(path.join(folder, file), bytes, {
        flag: "wx",
        mode: 0o600,
      });
    } catch (error) {
      if (!(
        error instanceof Error &&
        "code" in error &&
        error.code === "EEXIST"
      ))
        throw error;
    }
  }
  async image(file: string): Promise<Buffer | null> {
    if (!/^[a-f0-9]{64}\.jpg$/.test(file)) return null;
    for (const root of [this.options.stateRoot, this.options.contentRoot]) {
      try {
        const bytes = await readFile(
          path.join(root, "daily-verse-images", file),
        );
        return createHash("sha256").update(bytes).digest("hex") ===
          file.slice(0, -4)
          ? bytes
          : null;
      } catch (error) {
        if (!missing(error)) throw error;
      }
    }
    return null;
  }
}
