import { Inject, Injectable } from "@nestjs/common";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import type { PlaylistCatalog } from "../domain/playlists";
import { atomicJson, missing, readJson } from "../infrastructure/json-file";

@Injectable()
export class PlaylistsRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}

  async read(): Promise<PlaylistCatalog> {
    try {
      return await readJson<PlaylistCatalog>(
        path.join(this.options.contentRoot, "playlists.json"),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      return { revision: 0, items: [] };
    }
  }

  async publish(previous: PlaylistCatalog, next: PlaylistCatalog) {
    const backup = `playlists-${Date.now()}-${previous.revision}.json`;
    await atomicJson(
      path.join(this.options.stateRoot, "backups", backup),
      previous,
    );
    await atomicJson(
      path.join(this.options.contentRoot, "playlists.json"),
      next,
    );
    return backup;
  }
}
