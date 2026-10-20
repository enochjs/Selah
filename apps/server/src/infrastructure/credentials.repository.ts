import { Inject, Injectable } from "@nestjs/common";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { Credentials } from "../domain/models";
import { atomicJson, missing, readJson } from "./json-file";

@Injectable()
export class CredentialsRepository {
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async read() {
    try {
      return await readJson<Credentials>(
        path.join(this.options.stateRoot, "credentials.json"),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      return null;
    }
  }
  write(credentials: Credentials) {
    return atomicJson(
      path.join(this.options.stateRoot, "credentials.json"),
      credentials,
    );
  }
}
