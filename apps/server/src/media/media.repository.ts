import type { MediaAddress } from "./media.types";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { missing } from "../infrastructure/json-file";

@Injectable()
export class MediaRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async open(address: MediaAddress) {
    let file: string;
    if (["resources", "aligned"].includes(address.kind)) {
      if (!/^[a-f0-9]{64}\.mp3$/.test(address.name))
        throw new HttpException("音频不存在", 404);
      file =
        address.kind === "resources"
          ? path.join(this.options.mediaRoot, address.name)
          : path.join(this.options.alignmentRoot, "media", address.name);
    } else {
      if (
        !this.options.legacyRoot ||
        !["niv", "cuv"].includes(address.version || "") ||
        ![address.folder, address.name].every(
          (p) => p && p !== "." && p !== ".." && !/[/\\\0]/.test(p),
        ) ||
        !address.name.endsWith(".mp3")
      )
        throw new HttpException("音频不存在", 404);
      file = path.join(
        this.options.legacyRoot,
        "assets/mp3",
        address.version === "niv" ? "niv" : "和合本",
        address.folder!,
        address.name,
      );
    }
    try {
      const info = await stat(file);
      if (!info.isFile()) throw new HttpException("音频不存在", 404);
      return {
        size: info.size,
        mtime: info.mtime,
        mtimeMs: info.mtimeMs,
        stream: (start: number, end: number) =>
          createReadStream(file, { start, end }),
      };
    } catch (error) {
      if (missing(error)) throw new HttpException("音频不存在", 404);
      throw error;
    }
  }
}
