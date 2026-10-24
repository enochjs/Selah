import type { MediaAddress } from "./media.types";
import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { missing } from "../infrastructure/json-file";

function hasCompleteMp3Frame(header: Buffer, remainingSize: number): boolean {
  if (
    header.length < 4 ||
    header[0] !== 0xff ||
    (header[1] & 0xe0) !== 0xe0 ||
    (header[1] & 0x18) === 0x08 ||
    (header[1] & 0x06) !== 0x02 ||
    (header[2] & 0xf0) === 0 ||
    (header[2] & 0xf0) === 0xf0 ||
    (header[2] & 0x0c) === 0x0c
  )
    return false;
  const version = (header[1] >> 3) & 3;
  const rates =
    version === 3
      ? [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320]
      : [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
  const bitrate = rates[header[2] >> 4];
  const sampleRate =
    [44100, 48000, 32000][(header[2] >> 2) & 3] /
    (version === 3 ? 1 : version === 2 ? 2 : 4);
  const frameSize =
    Math.floor(((version === 3 ? 144000 : 72000) * bitrate) / sampleRate) +
    ((header[2] >> 1) & 1);
  return frameSize <= remainingSize;
}

@Injectable()
export class MediaRepository {
  private readonly downloadChecks = new Map<
    string,
    { size: number; mtimeMs: number; valid: boolean }
  >();

  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}

  async downloadMetadata(
    address: MediaAddress,
  ): Promise<{ size: number } | null> {
    try {
      const file = await this.open(address);
      if (file.size < 4) return null;
      const key = `${address.kind}/${address.name}`;
      const cached = this.downloadChecks.get(key);
      let valid: boolean;
      if (cached?.size === file.size && cached.mtimeMs === file.mtimeMs) {
        valid = cached.valid;
      } else {
        const prefix = await this.readPrefix(file, 0, 10);
        let offset = 0;
        if (prefix.subarray(0, 3).toString("latin1") === "ID3") {
          if (
            prefix.length < 10 ||
            prefix.subarray(6, 10).some((byte) => byte > 127)
          )
            return null;
          offset =
            10 +
            prefix[6] * 0x200000 +
            prefix[7] * 0x4000 +
            prefix[8] * 0x80 +
            prefix[9];
          // ID3v2.4 can append a ten-byte footer after its tag payload.
          if (prefix[3] === 4 && (prefix[5] & 0x10) !== 0) offset += 10;
        }
        const header =
          offset === 0 ? prefix : await this.readPrefix(file, offset, 4);
        valid = hasCompleteMp3Frame(header, file.size - offset);
        this.downloadChecks.set(key, {
          size: file.size,
          mtimeMs: file.mtimeMs,
          valid,
        });
      }
      return valid ? { size: file.size } : null;
    } catch (error) {
      if (
        missing(error) ||
        (error instanceof HttpException && error.getStatus() === 404)
      )
        return null;
      throw error;
    }
  }

  private async readPrefix(
    file: Awaited<ReturnType<MediaRepository["open"]>>,
    offset: number,
    length: number,
  ): Promise<Buffer> {
    if (offset >= file.size) return Buffer.alloc(0);
    const chunks: Buffer[] = [];
    for await (const chunk of file.stream(
      offset,
      Math.min(file.size - 1, offset + length - 1),
    ))
      chunks.push(Buffer.from(chunk as Uint8Array));
    return Buffer.concat(chunks);
  }

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
