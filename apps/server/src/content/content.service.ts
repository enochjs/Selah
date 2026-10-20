import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf } from "../common/pagination.dto";
import { ContentRepository } from "../infrastructure/content.repository";
import { StateRepository } from "../infrastructure/state.repository";
import { ContentQuery } from "./content-query.dto";

@Injectable()
export class ContentService {
  private verseIndex?: ReturnType<ContentService["buildVerseRows"]>;
  private recordingIndex?: ReturnType<ContentService["buildRecordingRows"]>;
  readonly startedAt = new Date().toISOString();
  constructor(
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(StateRepository) private readonly store: StateRepository,
  ) {}
  books() {
    return this.content.books.map((book) => ({
      id: book.id,
      en: book.en,
      zh: book.zh,
      testament: book.testament,
      chapters: book.chapters.length,
      verses: book.chapters.reduce((sum, c) => sum + c.length, 0),
      recordings: this.recordingRows().filter((r) => r.bookId === book.id)
        .length,
    }));
  }
  private recordingRows() {
    return (this.recordingIndex ??= this.buildRecordingRows());
  }
  private buildRecordingRows() {
    return Object.entries(this.content.catalog).map(([key, recording]) => {
      const [bookId, chapter, locale] = key.split(":");
      const book = this.content.books.find((b) => b.id === bookId);
      return {
        key,
        bookId,
        chapter: Number(chapter),
        locale,
        book: book?.en || bookId,
        bookZh: book?.zh || bookId,
        duration: recording.duration,
        timingQuality: recording.timingQuality,
        alignmentStatus: recording.alignmentStatus,
        items: recording.verseFiles?.length || recording.segments?.length || 0,
        reader: recording.reader || (locale === "zh" ? "合成朗读" : "—"),
      };
    });
  }
  private verseRows() {
    return (this.verseIndex ??= this.buildVerseRows());
  }
  private buildVerseRows() {
    return this.content.books.flatMap((book) =>
      book.chapters.flatMap((chapter, index) =>
        chapter.map((verse) => ({
          ...verse,
          key: `${book.id}:${index + 1}:${verse.number}`,
          bookId: book.id,
          book: book.en,
          bookZh: book.zh,
          testament: book.testament,
          chapter: index + 1,
        })),
      ),
    );
  }
  private validate(query: ContentQuery) {
    const book = query.book
      ? this.content.books.find((b) => b.id === query.book)
      : undefined;
    if (query.book && !book) throw new HttpException("书卷不存在", 400);
    if (query.chapter && book && query.chapter > book.chapters.length)
      throw new HttpException("章节无效", 400);
  }
  overview() {
    const state = this.store.get(),
      books = this.books(),
      recordings = this.recordingRows();
    return {
      counts: {
        books: books.length,
        chapters: books.reduce((n, b) => n + b.chapters, 0),
        verses: books.reduce((n, b) => n + b.verses, 0),
        recordings: recordings.length,
        aligned: recordings.filter((r) => r.alignmentStatus === "aligned")
          .length,
        dictionary: Object.keys(state.dictionary).length,
        flagged: Object.values(state.reviews).filter(
          (r) => r.status === "flagged",
        ).length,
        reviewed: Object.values(state.reviews).filter(
          (r) => r.status === "approved",
        ).length,
      },
      books,
      manifest: this.content.manifest,
      recent: state.audit.slice(0, 5),
      startedAt: this.startedAt,
      dictionaryDirty: state.revision !== state.publishedRevision,
    };
  }
  scripture(query: ContentQuery) {
    this.validate(query);
    const state = this.store.get(),
      q = query.q.trim().toLowerCase().replace(/\s/g, "");
    const rows = this.verseRows().filter(
      (r) =>
        (!query.book || r.bookId === query.book) &&
        (!query.chapter || r.chapter === query.chapter) &&
        (!query.testament || r.testament === query.testament) &&
        (!query.status ||
          (state.reviews[r.key]?.status || "pending") === query.status) &&
        (!q ||
          `${r.en} ${r.zh} ${r.book} ${r.chapter}:${r.number} ${r.bookZh} ${r.chapter}:${r.number}`
            .toLowerCase()
            .replace(/\s/g, "")
            .includes(q)),
    );
    return pageOf(
      rows.map((r) => ({ ...r, review: state.reviews[r.key] || null })),
      query,
    );
  }
  recordings(query: ContentQuery) {
    this.validate(query);
    const state = this.store.get(),
      q = query.q.trim().toLowerCase();
    return pageOf(
      this.recordingRows()
        .filter(
          (r) =>
            (!query.book || r.bookId === query.book) &&
            (!query.chapter || r.chapter === query.chapter) &&
            (!query.locale || r.locale === query.locale) &&
            (!query.quality || r.timingQuality === query.quality) &&
            (!q ||
              `${r.book} ${r.bookZh} ${r.chapter} ${r.reader}`
                .toLowerCase()
                .includes(q)),
        )
        .map((r) => ({ ...r, review: state.reviews[r.key] || null })),
      query,
    );
  }
  recording(key: string) {
    const recording = this.content.catalog[key];
    const row = this.recordingRows().find((r) => r.key === key);
    if (!recording || !row) throw new HttpException("音频记录不存在", 404);
    const verses =
      this.content.books.find((b) => b.id === row.bookId)?.chapters[
        row.chapter - 1
      ] || [];
    const items =
      recording.verseFiles?.map((v) => ({
        verse: v.verse,
        path: v.path,
        start: 0,
        end: v.duration,
        duration: v.duration,
        coveredVerses: v.coveredVerses,
      })) ||
      recording.segments?.map(([verse, start, end]) => ({
        verse,
        path: recording.path,
        start,
        end,
        duration: end - start,
      })) ||
      [];
    return {
      ...row,
      source: recording.sourceUrl || null,
      review: this.store.get().reviews[key] || null,
      items: items.map((item) => ({
        ...item,
        text:
          verses.find((v) => v.number === item.verse)?.[
            row.locale === "zh" ? "zh" : "en"
          ] || "",
      })),
    };
  }
  validReviewKey(key: string) {
    return (
      Object.hasOwn(this.content.catalog, key) ||
      this.verseRows().some((r) => r.key === key)
    );
  }
  bookLabel(id: string) {
    return this.content.books.find((b) => b.id === id)?.zh || id;
  }
}
