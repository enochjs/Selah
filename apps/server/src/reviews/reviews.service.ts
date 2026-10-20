import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf } from "../common/pagination.dto";
import { ContentService } from "../content/content.service";
import { StateRepository } from "../infrastructure/state.repository";
import { ReviewDto, ReviewQuery } from "./review.dto";

@Injectable()
export class ReviewsService {
  constructor(
    @Inject(StateRepository) private readonly store: StateRepository,
    @Inject(ContentService) private readonly content: ContentService,
  ) {}
  list(query: ReviewQuery) {
    const q = query.q.trim().toLowerCase();
    const items = Object.entries(this.store.get().reviews)
      .map(([key, review]) => {
        const [bookId, chapter, item] = key.split(":");
        return {
          key,
          ...review,
          bookId,
          bookZh: this.content.bookLabel(bookId),
          chapter: Number(chapter),
          item,
        };
      })
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .filter(
        (r) =>
          (!query.status || r.status === query.status) &&
          (!q || `${r.bookZh} ${r.key} ${r.note}`.toLowerCase().includes(q)),
      );
    return pageOf(items, query);
  }
  async save(body: ReviewDto, actor: string) {
    if (!this.content.validReviewKey(body.key))
      throw new HttpException("审核对象或状态无效", 400);
    await this.store.update("review.update", actor, body.key, (next) => {
      next.reviews[body.key] = {
        status: body.status,
        note: body.note.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: actor,
      };
    });
    return { ok: true };
  }
}
