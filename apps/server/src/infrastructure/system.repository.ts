import { Inject, Injectable } from "@nestjs/common";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { missing, readJson } from "./json-file";

@Injectable()
export class SystemRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async audit() {
    try {
      return await readJson<unknown>(
        path.join(this.options.auditRoot, "full-resource-validation.json"),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      return null;
    }
  }
  async publicFile(name: string) {
    return readFile(path.join(this.options.publicRoot, name));
  }

  checkContent() {
    return new Promise<{
      ok: boolean;
      output: string;
      checkedAt: string;
    }>((resolve) => {
      execFile(
        process.execPath,
        [
          this.options.checkScript,
          "--content-root",
          this.options.contentRoot,
          "--timing-root",
          this.options.timingRoot,
          "--audit-root",
          this.options.auditRoot,
        ],
        {
          cwd: path.resolve(this.options.contentRoot, "../../.."),
          timeout: 30000,
          maxBuffer: 32768,
        },
        (error, stdout, stderr) =>
          resolve({
            ok: !error,
            output: (stdout + stderr).slice(0, 16000),
            checkedAt: new Date().toISOString(),
          }),
      );
    });
  }
}
