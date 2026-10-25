import { Inject, Injectable } from "@nestjs/common";
import path from "node:path";
import { copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { HymnCatalog } from "../domain/hymns";
import { atomicJson, missing, readJson } from "../infrastructure/json-file";

@Injectable()
export class HymnsRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}

  async read(): Promise<HymnCatalog> {
    try {
      return await readJson<HymnCatalog>(
        path.join(this.options.contentRoot, "hymns.json"),
      );
    } catch (error) {
      // Existing custom content roots may predate the hymn catalog.
      if (!missing(error)) throw error;
      return { revision: 0, items: [] };
    }
  }

  async publish(previous: HymnCatalog, next: HymnCatalog) {
    const backup = `hymns-${Date.now()}-${previous.revision}.json`;
    await atomicJson(
      path.join(this.options.stateRoot, "backups", backup),
      previous,
    );
    await atomicJson(path.join(this.options.contentRoot, "hymns.json"), next);
    return backup;
  }

  async storeAudio(name: string, bytes: Uint8Array) {
    const folder = path.join(this.options.stateRoot, "hymn-media");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const target = path.join(folder, name);
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(temp, bytes, { mode: 0o600 });
    await rename(temp, target);
  }

  async publishAudio(name: string) {
    const folder = path.join(this.options.stateRoot, "hymn-published");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const target = path.join(folder, name);
    const temp = `${target}.${randomBytes(6).toString("hex")}.tmp`;
    await copyFile(path.join(this.options.stateRoot, "hymn-media", name), temp);
    await rename(temp, target);
  }
}
