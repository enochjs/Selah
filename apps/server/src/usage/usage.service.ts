import { HttpException, Inject, Injectable } from "@nestjs/common";
import { usageDays } from "../domain/usage";
import type { UsageBatch } from "../domain/usage";
import { UsageRepository } from "./usage.repository";
import { ContentRepository } from "../infrastructure/content.repository";

@Injectable()
export class UsageService {
  constructor(
    @Inject(UsageRepository) private readonly repository: UsageRepository,
    @Inject(ContentRepository) private readonly content: ContentRepository,
  ) {}
  record(batch: UsageBatch) {
    const now = Date.now();
    for (const event of batch.events) {
      if (
        event.at > now + 300000 ||
        event.at < now - 7 * 86400000 ||
        (event.type === "listen" &&
          (!event.kind || !event.contentId || event.seconds < 1)) ||
        (event.type === "active" && event.seconds < 1) ||
        (["view", "visit"].includes(event.type) && event.seconds !== 0) ||
        (event.type !== "listen" &&
          (event.kind !== undefined || event.contentId !== undefined))
      )
        throw new HttpException("使用记录格式无效或已过期", 400);
    }
    return this.repository.append(batch);
  }
  async dashboard(days: number) {
    const data = this.repository.dashboard(usageDays(days));
    const hymnTitles = await this.repository.hymnTitles();
    const title = (event: { kind: string; contentId: string }) => {
      if (event.kind === "hymn")
        return hymnTitles.get(event.contentId) ?? event.contentId;
      const [bookId, chapter, locale] = event.contentId.split(":");
      const book = this.content.books.find((book) => book.id === bookId);
      return book
        ? `${book.zh} ${chapter} · ${locale === "en" ? "英文" : "中文"}`
        : event.contentId;
    };
    return {
      ...data,
      timeZone: "Asia/Shanghai",
      days,
      retentionDays: 90,
      generatedAt: new Date().toISOString(),
      content: data.content.map((row) => ({ ...row, title: title(row) })),
    };
  }
}
