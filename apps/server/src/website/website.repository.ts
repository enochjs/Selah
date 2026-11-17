import { Inject, Injectable } from "@nestjs/common";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";

@Injectable()
export class WebsiteRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}

  read(name: string) {
    return readFile(path.join(this.options.publicRoot, "website", name));
  }
}
