import { Inject, Injectable, OnModuleInit } from "@nestjs/common";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { State } from "../domain/models";
import { ContentRepository } from "./content.repository";
import { atomicJson, missing, readJson } from "./json-file";

@Injectable()
export class StateRepository implements OnModuleInit {
  private state!: State;
  private pending: Promise<unknown> = Promise.resolve();
  constructor(
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {}
  async onModuleInit() {
    try {
      this.state = await readJson<State>(
        path.join(this.options.stateRoot, "state.json"),
      );
    } catch (error) {
      if (!missing(error)) throw error;
      this.state = {
        revision: 0,
        publishedRevision: 0,
        dictionary: await this.content.read("dictionary.json"),
        reviews: {},
        audit: [],
      };
    }
  }
  get() {
    return structuredClone(this.state);
  }
  update<T>(
    action: string,
    actor: string,
    target: string,
    mutate: (next: State) => T | Promise<T>,
  ): Promise<T> {
    const result = this.pending.then(async () => {
      const next = structuredClone(this.state);
      const value = await mutate(next);
      next.audit.unshift({
        id: randomBytes(12).toString("hex"),
        at: new Date().toISOString(),
        action,
        actor,
        target,
      });
      next.audit = next.audit.slice(0, 5000);
      await atomicJson(path.join(this.options.stateRoot, "state.json"), next);
      this.state = next;
      return value;
    });
    this.pending = result.catch(() => {});
    return result;
  }
}
