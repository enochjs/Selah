import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { stat } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { Book, DictionaryEntry, Recording } from "../domain/models";
import { atomicJson, missing, readJson } from "./json-file";

@Injectable()
export class ContentRepository implements OnModuleInit {
  books: Book[] = [];
  catalog: Record<string, Recording> = {};
  manifest: Record<string, unknown> = {};
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async onModuleInit() {
    [this.books, this.catalog, this.manifest] = await Promise.all([
      this.read<Book[]>("bible.json"),
      this.read<Record<string, Recording>>("chapter-audio.json"),
      this.read<Record<string, unknown>>("resource-manifest.json"),
    ]);
  }
  read<T>(name: string) {
    return readJson<T>(path.join(this.options.contentRoot, name));
  }
  async publishDictionary(
    dictionary: Record<string, DictionaryEntry>,
    revision: number,
  ) {
    const backup = `dictionary-${Date.now()}-${revision}.json`;
    await atomicJson(
      path.join(this.options.stateRoot, "backups", backup),
      await this.read("dictionary.json"),
    );
    await atomicJson(
      path.join(this.options.contentRoot, "dictionary.json"),
      dictionary,
    );
    return backup;
  }
  async dictionaryUpdatedAt() {
    try {
      return (
        await stat(path.join(this.options.contentRoot, "dictionary.json"))
      ).mtime.toISOString();
    } catch (error) {
      if (!missing(error)) throw error;
      return null;
    }
  }
}
