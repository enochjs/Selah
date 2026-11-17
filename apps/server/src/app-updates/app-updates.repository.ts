import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import type { AppUpdateCatalog, UpdateArtifact } from "../domain/app-updates";
import { atomicJson, missing, readJson } from "../infrastructure/json-file";
@Injectable()
export class AppUpdatesRepository {
  private readonly root: string;
  constructor(@Inject(SERVER_OPTIONS) options: ServerOptions) {
    this.root = path.join(options.stateRoot, "app-updates");
  }
  async read(): Promise<AppUpdateCatalog> {
    try {
      return await readJson<AppUpdateCatalog>(
        path.join(this.root, "catalog.json"),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      return { revision: 0, items: [] };
    }
  }
  async publish(previous: AppUpdateCatalog, next: AppUpdateCatalog) {
    const backup = `releases-${previous.revision}-${Date.now()}.json`;
    await atomicJson(path.join(this.root, "backups", backup), previous);
    await atomicJson(path.join(this.root, "catalog.json"), next);
    return backup;
  }
  async upload(buffer: Buffer): Promise<UpdateArtifact> {
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    await mkdir(path.join(this.root, "artifacts"), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = path.join(
      this.root,
      "artifacts",
      `${sha256}.${randomUUID()}.tmp`,
    );
    try {
      await writeFile(temporary, buffer, { mode: 0o600, flag: "wx" });
      await rename(temporary, this.file(sha256));
    } finally {
      await rm(temporary, { force: true });
    }
    return {
      path: `/api/app-updates/artifacts/${sha256}.apk`,
      size: buffer.length,
      sha256,
    };
  }
  async verify(artifact: UpdateArtifact) {
    if (artifact.path !== `/api/app-updates/artifacts/${artifact.sha256}.apk`)
      throw new HttpException("安装包路径与摘要不一致", 400);
    let buffer: Buffer;
    try {
      buffer = await readFile(this.file(artifact.sha256));
    } catch (error) {
      if (!missing(error)) throw error;
      throw new HttpException("请先上传安装包", 400);
    }
    if (
      buffer.length !== artifact.size ||
      createHash("sha256").update(buffer).digest("hex") !== artifact.sha256
    )
      throw new HttpException("安装包大小或摘要不匹配", 400);
  }
  async open(sha256: string) {
    try {
      const file = this.file(sha256);
      const info = await stat(file);
      return {
        size: info.size,
        mtime: info.mtime,
        stream: (start: number, end: number) =>
          createReadStream(file, { start, end }),
      };
    } catch (error) {
      if (!missing(error)) throw error;
      throw new HttpException("安装包不存在", 404);
    }
  }
  private file(sha256: string) {
    if (!/^[a-f0-9]{64}$/.test(sha256))
      throw new HttpException("安装包不存在", 404);
    return path.join(this.root, "artifacts", `${sha256}.apk`);
  }
}
