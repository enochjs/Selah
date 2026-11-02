import { HttpException, Inject, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  DailyVerseCatalog,
  DailyVerseEntry,
  DailyVerseReference,
  addDays,
  isDateKey,
  localDateKey,
  parseDailyVerseCatalog,
  publishedDailyVerseCatalog,
} from "@selah/content/daily-verses";
import { ContentRepository } from "../infrastructure/content.repository";
import { StateRepository } from "../infrastructure/state.repository";
import { DailyVersesRepository } from "./daily-verses.repository";
import {
  DailyVerseQuery,
  ReviewDailyVerseDto,
  SaveDailyVerseDto,
  UploadDailyImageDto,
} from "./daily-verses.dto";
@Injectable()
export class DailyVersesService {
  constructor(
    @Inject(DailyVersesRepository)
    private readonly repository: DailyVersesRepository,
    @Inject(ContentRepository) private readonly content: ContentRepository,
    @Inject(StateRepository) private readonly state: StateRepository,
  ) {}
  private validate(value: unknown) {
    try {
      return parseDailyVerseCatalog(value);
    } catch {
      throw new HttpException(
        "每日经文日期或资料无效（日期、图片和引用不得重复或缺失）",
        400,
      );
    }
  }
  private revision(catalog: DailyVerseCatalog, revision: number) {
    if (catalog.revision !== revision)
      throw new HttpException("资料已更新，请刷新后重试", 409);
  }
  private scripture(reference: DailyVerseReference) {
    const book = this.content.books.find(
      (book) => book.id === reference.bookId,
    );
    const chapter = book?.chapters[reference.chapter - 1];
    const end = reference.endVerse ?? reference.verse;
    if (!book || !chapter || end < reference.verse || end - reference.verse > 9)
      throw new HttpException("经文范围不存在或超过10节", 400);
    const verses = chapter.filter(
      (verse) => verse.number >= reference.verse && verse.number <= end,
    );
    if (verses.length !== end - reference.verse + 1)
      throw new HttpException("经节不存在", 400);
    if (
      verses.some(
        (verse) =>
          !verse.zh.trim() ||
          !verse.en.trim() ||
          ("enOmitted" in verse && verse.enOmitted) ||
          ("zhOmitted" in verse && verse.zhOmitted) ||
          ("enMergedInto" in verse && verse.enMergedInto) ||
          ("zhMergedInto" in verse && verse.zhMergedInto),
      )
    )
      throw new HttpException(
        "经文必须包含完整中英文，不能使用省略或合并经节",
        400,
      );
    return { bookId: book.id, bookZh: book.zh, bookEn: book.en, verses };
  }
  async list(query: DailyVerseQuery) {
    const today = query.date ?? localDateKey();
    for (const value of [today, query.from, query.to])
      if (value !== undefined && !isDateKey(value))
        throw new HttpException("日期无效", 400);
    if (query.from && query.to && query.from > query.to)
      throw new HttpException("日期范围无效", 400);
    const catalog = await this.repository.read();
    const approved = catalog.items.filter((item) => item.status === "approved");
    const dates = new Set(approved.map((item) => item.date));
    let reserveDays = 0;
    while (reserveDays < 366 && dates.has(addDays(today, reserveDays)))
      reserveDays++;
    return {
      ...catalog,
      items: catalog.items
        .filter(
          (item) =>
            (!query.from || item.date >= query.from) &&
            (!query.to || item.date <= query.to),
        )
        .sort((a, b) => a.date.localeCompare(b.date)),
      counts: {
        total: catalog.items.length,
        approved: approved.length,
        draft: catalog.items.filter((item) => item.status === "draft").length,
        withdrawn: catalog.items.filter((item) => item.status === "withdrawn")
          .length,
        futureDays: approved.filter((item) => item.date >= today).length,
        reserveDays,
        lowReserve: reserveDays < 30,
      },
      date: today,
    };
  }
  async published() {
    return publishedDailyVerseCatalog(await this.repository.read());
  }
  async preview(id: string) {
    const item = (await this.repository.read()).items.find(
      (item) => item.id === id,
    );
    if (!item) throw new HttpException("每日经文不存在", 404);
    return { item, scripture: this.scripture(item.reference) };
  }
  private unique(catalog: DailyVerseCatalog, item: DailyVerseEntry) {
    const start = addDays(item.date, -365),
      end = addDays(item.date, 365);
    if (
      catalog.items.some(
        (other) =>
          other.id !== item.id &&
          other.status !== "withdrawn" &&
          other.date >= start &&
          other.date <= end &&
          (other.imageId === item.imageId ||
            (other.reference.bookId === item.reference.bookId &&
              other.reference.chapter === item.reference.chapter &&
              other.reference.verse <=
                (item.reference.endVerse ?? item.reference.verse) &&
              item.reference.verse <=
                (other.reference.endVerse ?? other.reference.verse))),
      )
    )
      throw new HttpException(
        "一年内不能重复图片或重叠经文，请选择新内容",
        400,
      );
  }
  async save(body: SaveDailyVerseDto, actor: string) {
    return this.state.update("daily-verse.save", actor, body.id, async () => {
      const catalog = await this.repository.read();
      this.revision(catalog, body.revision);
      this.scripture(body.reference);
      const item: DailyVerseEntry = {
        id: body.id,
        date: body.date,
        reference: body.reference,
        imageId: body.imageId,
        theme: body.theme.trim(),
        status: "draft",
      };
      if (!isDateKey(item.date)) throw new HttpException("日期无效", 400);
      this.unique(catalog, item);
      const next = this.validate({
        ...catalog,
        revision: catalog.revision + 1,
        items: [...catalog.items.filter((row) => row.id !== item.id), item],
      });
      return {
        ok: true,
        revision: next.revision,
        backup: await this.repository.publish(catalog, next),
      };
    });
  }
  async review(body: ReviewDailyVerseDto, actor: string) {
    return this.state.update("daily-verse.review", actor, body.id, async () => {
      const catalog = await this.repository.read();
      this.revision(catalog, body.revision);
      const item = catalog.items.find((row) => row.id === body.id);
      if (!item) throw new HttpException("每日经文不存在", 404);
      if (body.status === "approved") {
        this.scripture(item.reference);
        this.unique(catalog, item);
        const image = catalog.images.find((image) => image.id === item.imageId);
        if (!image || !(await this.repository.image(image.file)))
          throw new HttpException("图片不存在", 400);
      }
      const next = this.validate({
        ...catalog,
        revision: catalog.revision + 1,
        items: catalog.items.map((row) =>
          row.id === item.id
            ? {
                ...row,
                status: body.status,
                reviewedAt: new Date().toISOString(),
                reviewedBy: actor,
              }
            : row,
        ),
      });
      return {
        ok: true,
        revision: next.revision,
        backup: await this.repository.publish(catalog, next),
      };
    });
  }
  async upload(
    body: UploadDailyImageDto,
    bytes: Buffer | undefined,
    actor: string,
  ) {
    if (!bytes || bytes.length > 5 * 1024 * 1024)
      throw new HttpException("请选择不超过5MB的JPEG图片", 400);
    let width: number, height: number;
    try {
      const image = sharp(bytes, {
        failOn: "warning",
        limitInputPixels: 16000000,
      });
      const metadata = await image.metadata();
      if (metadata.format !== "jpeg" || !metadata.width || !metadata.height)
        throw new Error();
      await image.raw().toBuffer();
      width = metadata.width;
      height = metadata.height;
    } catch {
      throw new HttpException("JPEG图片无效或不完整", 400);
    }
    const id = createHash("sha256").update(bytes).digest("hex");
    return this.state.update(
      "daily-verse.image.upload",
      actor,
      id,
      async () => {
        const catalog = await this.repository.read();
        this.revision(catalog, body.revision);
        if (catalog.images.some((image) => image.id === id))
          throw new HttpException("图片已存在，来源与授权元数据不可覆盖", 409);
        const { revision: _revision, ...metadata } = body;
        void _revision;
        const image = {
          ...metadata,
          id,
          file: `${id}.jpg`,
          sha256: id,
          width,
          height,
        };
        const next = this.validate({
          ...catalog,
          revision: catalog.revision + 1,
          images: [...catalog.images, image],
        });
        await this.repository.store(image.file, bytes);
        return {
          ok: true,
          image,
          revision: next.revision,
          backup: await this.repository.publish(catalog, next),
        };
      },
    );
  }
  async image(file: string, published: boolean) {
    const catalog = await this.repository.read();
    const allowed = published ? publishedDailyVerseCatalog(catalog) : catalog;
    if (!allowed.images.some((image) => image.file === file))
      throw new HttpException("图片不存在", 404);
    const bytes = await this.repository.image(file);
    if (!bytes) throw new HttpException("图片不存在", 404);
    return bytes;
  }
}
