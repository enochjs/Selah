import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf } from "../common/pagination.dto";
import { StateRepository } from "../infrastructure/state.repository";
import { MediaRepository } from "../media/media.repository";
import { MediaService } from "../media/media.service";
import {
  HymnsQuery,
  SaveHymnDto,
  UploadHymnDto,
  ReviewHymnDto,
  DeleteHymnDto,
} from "./hymns.dto";
import { HymnsRepository } from "./hymns.repository";
import { createHash, randomUUID } from "node:crypto";
import { mp3Duration } from "../domain/mp3";
import type { Hymn } from "../domain/hymns";
import type { MediaRequest } from "../media/media.types";

@Injectable()
export class HymnsService {
  constructor(
    @Inject(HymnsRepository) private readonly repository: HymnsRepository,
    @Inject(StateRepository) private readonly state: StateRepository,
    @Inject(MediaRepository) private readonly media: MediaRepository,
    @Inject(MediaService) private readonly mediaService: MediaService,
  ) {}

  private async catalog(published = false) {
    const catalog = await this.repository.read();
    const items = await Promise.all(
      catalog.items.map(async (item) => {
        const match = item.audioPath.match(
          /^\/api\/audio\/(?:resources|hymns)\/([a-f0-9]{64}\.mp3)$/,
        );
        const audioAvailable = Boolean(
          match &&
          (await this.media.downloadMetadata({
            kind: item.uploadedAt
              ? published
                ? "hymn-published"
                : "hymn-draft"
              : "resources",
            name: match[1],
          })),
        );
        return { ...item, audioAvailable };
      }),
    );
    const enabled = items.filter((item) => item.enabled).length;
    return {
      ...catalog,
      items,
      counts: {
        total: items.length,
        enabled,
        disabled: items.length - enabled,
        audioAvailable: items.filter((item) => item.audioAvailable).length,
      },
    };
  }

  async summary() {
    return (await this.catalog()).counts;
  }

  async list(query: HymnsQuery) {
    const catalog = await this.catalog();
    const q = query.q.trim().toLowerCase();
    return {
      ...pageOf(
        catalog.items.filter(
          (item) =>
            (!q ||
              `${item.titleZh} ${item.titleEn} ${item.subtitleZh} ${item.subtitleEn} ${item.artist} ${item.category}`
                .toLowerCase()
                .includes(q)) &&
            (!query.category || item.category === query.category) &&
            (!query.status || item.enabled === (query.status === "enabled")) &&
            (!query.reviewStatus ||
              (item.reviewStatus ?? "approved") === query.reviewStatus),
        ),
        query,
      ),
      revision: catalog.revision,
      counts: catalog.counts,
      categories: [...new Set(catalog.items.map((item) => item.category))],
    };
  }

  async save(body: SaveHymnDto, actor: string) {
    return this.state.update("hymn.save", actor, body.id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("诗歌资料已被更新，请刷新后重新操作", 409);
      const item = catalog.items.find((item) => item.id === body.id);
      if (!item) throw new HttpException("诗歌不存在", 404);
      if (item.reviewStatus && item.reviewStatus !== "approved" && body.enabled)
        throw new HttpException("请先审核通过，再向用户提供此诗歌", 400);
      const updated = {
        ...item,
        titleZh: body.titleZh.trim(),
        titleEn: body.titleEn.trim(),
        subtitleZh: body.subtitleZh.trim(),
        subtitleEn: body.subtitleEn.trim(),
        artist: body.artist.trim(),
        category: body.category.trim(),
        source: body.source.trim(),
        license: body.license.trim(),
        enabled: body.enabled,
      };
      const detailsChanged = Object.keys(body).some(
        (key) =>
          key !== "revision" &&
          key !== "enabled" &&
          updated[key as keyof Hymn] !== item[key as keyof Hymn],
      );
      if (item.uploadedAt && detailsChanged) {
        updated.reviewStatus = "pending";
        updated.enabled = false;
        delete updated.reviewedAt;
        delete updated.reviewedBy;
        delete updated.reviewNote;
      }
      const next = {
        ...catalog,
        revision: catalog.revision + 1,
        items: catalog.items.map((row) => (row.id === item.id ? updated : row)),
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, revision: next.revision, backup };
    });
  }

  async remove(body: DeleteHymnDto, actor: string) {
    return this.state.update("hymn.delete", actor, body.id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("诗歌资料已被更新，请刷新后重新删除", 409);
      if (!catalog.items.some((item) => item.id === body.id))
        throw new HttpException("诗歌不存在", 404);
      const next = {
        ...catalog,
        revision: catalog.revision + 1,
        items: catalog.items.filter((item) => item.id !== body.id),
      };
      // Retain audio for backup recovery and other hymns sharing the same file.
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, revision: next.revision, backup };
    });
  }

  async published() {
    const catalog = await this.catalog(true);
    return {
      revision: catalog.revision,
      items: catalog.items
        .filter(
          (item) =>
            item.enabled &&
            (!item.uploadedAt || item.audioAvailable) &&
            (!item.reviewStatus || item.reviewStatus === "approved"),
        )
        .map(
          ({
            audioAvailable: _available,
            reviewNote: _note,
            reviewedBy: _actor,
            ...item
          }) => {
            void _available;
            void _note;
            void _actor;
            return item;
          },
        ),
    };
  }

  async upload(
    body: UploadHymnDto,
    file: { bytes: Uint8Array; name: string } | undefined,
    actor: string,
  ) {
    if (!file || !/\.mp3$/i.test(file.name))
      throw new HttpException("请选择 MP3 音频文件", 400);
    const duration = mp3Duration(file.bytes);
    if (duration === null)
      throw new HttpException("MP3 文件无效或不完整，请重新选择", 400);
    const name = `${createHash("sha256").update(file.bytes).digest("hex")}.mp3`;
    const id = `hymn-${randomUUID()}`;
    return this.state.update("hymn.upload", actor, id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("诗歌资料已被更新，请刷新后重新上传", 409);
      const { revision: _revision, ...details } = body;
      void _revision;
      const item: Hymn = {
        ...details,
        ...Object.fromEntries(
          Object.entries(details).map(([key, value]) => [key, value.trim()]),
        ),
        id,
        duration,
        audioPath: `/api/audio/hymns/${name}`,
        enabled: false,
        reviewStatus: "pending",
        uploadedAt: new Date().toISOString(),
      };
      await this.repository.storeAudio(name, file.bytes);
      const next = {
        revision: catalog.revision + 1,
        items: [...catalog.items, item],
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, item, revision: next.revision, backup };
    });
  }

  async review(body: ReviewHymnDto, actor: string) {
    return this.state.update("hymn.review", actor, body.id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("诗歌资料已被更新，请刷新后重新审核", 409);
      const item = catalog.items.find((row) => row.id === body.id);
      if (!item) throw new HttpException("诗歌不存在", 404);
      if (!item.uploadedAt || item.reviewStatus !== "pending")
        throw new HttpException("仅待审核诗歌可以审核", 400);
      if (body.status === "approved") {
        const name = this.audioName(item);
        if (!(await this.media.downloadMetadata({ kind: "hymn-draft", name })))
          throw new HttpException("音频文件不可用，无法发布", 400);
        await this.repository.publishAudio(name);
      }
      const updated: Hymn = {
        ...item,
        reviewStatus: body.status,
        enabled: body.status === "approved",
        reviewNote: body.note?.trim() ?? "",
        reviewedAt: new Date().toISOString(),
        reviewedBy: actor,
      };
      const next = {
        revision: catalog.revision + 1,
        items: catalog.items.map((row) => (row.id === item.id ? updated : row)),
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, revision: next.revision, backup };
    });
  }

  async preview(id: string, request: MediaRequest) {
    const item = (await this.repository.read()).items.find(
      (row) => row.id === id,
    );
    if (!item) throw new HttpException("诗歌不存在", 404);
    const plan = await this.mediaService.prepare(
      {
        kind: item.uploadedAt ? "hymn-draft" : "resources",
        name: this.audioName(item),
      },
      request,
    );
    return {
      ...plan,
      headers: { ...plan.headers, "Cache-Control": "no-store" },
    };
  }

  async publishedAudio(name: string, request: MediaRequest) {
    if (!/^[a-f0-9]{64}\.mp3$/.test(name))
      throw new HttpException("音频不存在", 404);
    const catalog = await this.repository.read();
    if (
      !catalog.items.some(
        (item) =>
          item.uploadedAt &&
          item.enabled &&
          item.reviewStatus === "approved" &&
          item.audioPath === `/api/audio/hymns/${name}`,
      )
    )
      throw new HttpException("音频不存在", 404);
    const plan = await this.mediaService.prepare(
      { kind: "hymn-published", name },
      request,
    );
    return {
      ...plan,
      headers: { ...plan.headers, "Cache-Control": "no-store" },
    };
  }

  private audioName(item: Hymn) {
    const match = item.audioPath.match(
      /^\/api\/audio\/(?:resources|hymns)\/([a-f0-9]{64}\.mp3)$/,
    );
    if (!match) throw new HttpException("音频不存在", 404);
    return match[1];
  }
}
