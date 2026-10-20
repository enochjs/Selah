import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf, PageQuery } from "../common/pagination.dto";
import { ContentRepository } from "../infrastructure/content.repository";
import { StateRepository } from "../infrastructure/state.repository";
import { SystemRepository } from "../infrastructure/system.repository";

@Injectable()
export class SystemService {
  private checkRunning = false;
  readonly startedAt = new Date().toISOString();
  constructor(
    @Inject(StateRepository) private readonly state: StateRepository,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(SystemRepository) private readonly repository: SystemRepository,
  ) {}
  audit(query: PageQuery) {
    const q = query.q.trim().toLowerCase();
    return pageOf(
      this.state
        .get()
        .audit.filter(
          (r) =>
            !q ||
            `${r.action} ${r.target} ${r.actor}`.toLowerCase().includes(q),
        ),
      query,
    );
  }
  export() {
    return this.state.get();
  }
  async info() {
    const state = this.state.get();
    return {
      node: process.version,
      startedAt: this.startedAt,
      manifest: this.content.manifest,
      audit: await this.repository.audit(),
      dictionaryUpdatedAt: await this.content.dictionaryUpdatedAt(),
      revision: state.revision,
      publishedRevision: state.publishedRevision,
      checkRunning: this.checkRunning,
      storage: "storage/admin/",
      sessionHours: 8,
      persistence: "设备本地（未接入用户云同步）",
    };
  }
  async check(actor: string) {
    if (this.checkRunning)
      throw new HttpException("校验正在运行，请稍后再试", 409);
    this.checkRunning = true;
    try {
      const result = await this.repository.checkContent();
      await this.state.update(
        result.ok ? "content.check.passed" : "content.check.failed",
        actor,
        "经文与音频索引",
        () => {},
      );
      return result;
    } finally {
      this.checkRunning = false;
    }
  }
  async publicFile(name: string) {
    const types: Record<string, string> = {
      "index.html": "text/html; charset=utf-8",
      "app.js": "text/javascript; charset=utf-8",
      "audio-preview.js": "text/javascript; charset=utf-8",
      "style.css": "text/css; charset=utf-8",
    };
    if (!Object.hasOwn(types, name)) throw new HttpException("页面不存在", 404);
    return { bytes: await this.repository.publicFile(name), type: types[name] };
  }
}
