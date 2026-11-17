import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { AdminRelease } from "../domain/app-updates";
import { StateRepository } from "../infrastructure/state.repository";
import type { MediaRequest, MediaResponsePlan } from "../media/media.types";
import { DeleteUpdateDto, SaveUpdateDto, UpdateQuery } from "./app-updates.dto";
import { AppUpdatesRepository } from "./app-updates.repository";
@Injectable()
export class AppUpdatesService {
  constructor(
    @Inject(AppUpdatesRepository)
    private readonly repository: AppUpdatesRepository,
    @Inject(StateRepository) private readonly state: StateRepository,
  ) {}
  list() {
    return this.repository.read();
  }
  private compatible(platform: string, channel: string) {
    if (
      (platform === "ios" && channel === "direct") ||
      (platform === "android" && channel === "testflight")
    )
      throw new HttpException("平台与发布渠道不匹配", 400);
  }
  async latest(query: UpdateQuery) {
    this.compatible(query.platform, query.channel);
    const catalog = await this.repository.read();
    const item = catalog.items
      .filter(
        (row) =>
          row.enabled &&
          row.platform === query.platform &&
          row.channel === query.channel &&
          row.buildNumber > query.buildNumber,
      )
      .sort((a, b) => b.buildNumber - a.buildNumber)[0];
    if (!item) return { release: null };
    const { enabled, ...release } = item;
    void enabled;
    return { release };
  }
  async upload(
    buffer: Buffer | undefined,
    name: string | undefined,
    actor: string,
  ) {
    if (
      !buffer ||
      buffer.length < 4 ||
      buffer.length > 200 * 1024 * 1024 ||
      !name?.toLowerCase().endsWith(".apk") ||
      !buffer.subarray(0, 4).equals(Buffer.from([80, 75, 3, 4]))
    )
      throw new HttpException("请上传有效的 APK 文件（最大 200 MB）", 400);
    return this.state.update(
      "app-update.artifact.upload",
      actor,
      name,
      async () => ({ artifact: await this.repository.upload(buffer) }),
    );
  }
  async save(body: SaveUpdateDto, actor: string) {
    this.compatible(body.platform, body.channel);
    if (body.minSupportedBuild > body.buildNumber)
      throw new HttpException("最低支持构建号不能高于本次构建号", 400);
    if (body.channel === "direct") {
      if (!body.artifact || body.storeUrl !== null)
        throw new HttpException(
          "直接安装渠道需要上传 APK，商店链接应为空",
          400,
        );
    } else {
      if (body.artifact !== null || !this.officialUrl(body))
        throw new HttpException(
          "请填写对应平台的官方商店链接，不可附加 APK",
          400,
        );
    }
    const id = body.id ?? `release-${randomUUID()}`;
    return this.state.update("app-update.save", actor, id, async () => {
      const catalog = await this.repository.read();
      this.revision(body.revision, catalog.revision);
      const previous = catalog.items.find((item) => item.id === body.id);
      if (body.id && !previous) throw new HttpException("版本不存在", 404);
      const identity = (item: SaveUpdateDto | AdminRelease) =>
        JSON.stringify([
          item.platform,
          item.channel,
          item.appId,
          item.version,
          item.buildNumber,
          item.artifact
            ? [item.artifact.path, item.artifact.size, item.artifact.sha256]
            : null,
          item.storeUrl,
        ]);
      if (previous?.publishedAt && identity(previous) !== identity(body))
        throw new HttpException(
          "已发布版本身份不可修改，请新建更高构建号",
          409,
        );
      const peers = catalog.items.filter(
        (item) =>
          item.id !== id &&
          item.platform === body.platform &&
          item.channel === body.channel,
      );
      if (
        peers.some((item) => item.buildNumber === body.buildNumber) ||
        (body.enabled &&
          peers.some(
            (item) => item.publishedAt && item.buildNumber > body.buildNumber,
          ))
      )
        throw new HttpException("构建号已存在或低于已发布版本", 409);
      if (body.artifact) await this.repository.verify(body.artifact);
      const { revision, id: ignored, ...fields } = body;
      void revision;
      void ignored;
      const item: AdminRelease = {
        ...fields,
        id,
        notesZh: body.notesZh.trim(),
        notesEn: body.notesEn.trim(),
        publishedAt:
          previous?.publishedAt ||
          (body.enabled ? new Date().toISOString() : ""),
      };
      const next = {
        revision: catalog.revision + 1,
        items: previous
          ? catalog.items.map((row) => (row.id === id ? item : row))
          : [...catalog.items, item],
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, item, revision: next.revision, backup };
    });
  }
  async remove(body: DeleteUpdateDto, actor: string) {
    return this.state.update(
      "app-update.withdraw",
      actor,
      body.id,
      async () => {
        const catalog = await this.repository.read();
        this.revision(body.revision, catalog.revision);
        if (!catalog.items.some((item) => item.id === body.id))
          throw new HttpException("版本不存在", 404);
        // Retain published identities so withdrawn build numbers cannot be reused or downgraded.
        const next = {
          revision: catalog.revision + 1,
          items: catalog.items.map((item) =>
            item.id === body.id ? { ...item, enabled: false } : item,
          ),
        };
        const backup = await this.repository.publish(catalog, next);
        return { ok: true, revision: next.revision, backup };
      },
    );
  }
  private revision(expected: number, current: number) {
    if (expected !== current)
      throw new HttpException("版本资料已更新，请刷新后重试", 409);
  }
  private officialUrl(body: SaveUpdateDto) {
    try {
      const url = new URL(body.storeUrl ?? "");
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.hash
      )
        return false;
      if (body.platform === "android")
        return (
          url.hostname === "play.google.com" &&
          url.pathname === "/store/apps/details" &&
          url.searchParams.get("id") === body.appId
        );
      return body.channel === "testflight"
        ? url.hostname === "testflight.apple.com" &&
            /^\/join\/[A-Za-z0-9]+$/.test(url.pathname)
        : url.hostname === "apps.apple.com" &&
            /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+$/.test(url.pathname);
    } catch {
      return false;
    }
  }
  async artifact(
    name: string,
    request: MediaRequest,
  ): Promise<MediaResponsePlan> {
    if (!/^[a-f0-9]{64}\.apk$/.test(name))
      throw new HttpException("安装包不存在", 404);
    const catalog = await this.repository.read();
    if (
      !catalog.items.some(
        (item) =>
          item.enabled &&
          item.channel === "direct" &&
          item.artifact?.sha256 === name.slice(0, -4),
      )
    )
      throw new HttpException("安装包已下架或不存在", 404);
    const file = await this.repository.open(name.slice(0, -4));
    const etag = `"${name.slice(0, -4)}"`;
    const headers: Record<string, string> = {
      "Content-Type": "application/vnd.android.package-archive",
      "Accept-Ranges": "bytes",
      ETag: etag,
      "Last-Modified": file.mtime.toUTCString(),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": 'attachment; filename="selah.apk"',
    };
    if (request.ifNoneMatch === etag) return { status: 304, headers };
    let start = 0,
      end = file.size - 1,
      partial = false;
    if (
      request.range &&
      (!request.ifRange ||
        request.ifRange === etag ||
        request.ifRange === file.mtime.toUTCString())
    ) {
      const match = request.range.match(/^bytes=(\d*)-(\d*)$/);
      const invalid = (): MediaResponsePlan => ({
        status: 416,
        headers: { ...headers, "Content-Range": `bytes */${file.size}` },
      });
      if (!match || (!match[1] && !match[2])) return invalid();
      if (!match[1]) start = Math.max(0, file.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start > end ||
        start >= file.size
      )
        return invalid();
      partial = true;
      headers["Content-Range"] = `bytes ${start}-${end}/${file.size}`;
    }
    headers["Content-Length"] = String(end - start + 1);
    return {
      status: partial ? 206 : 200,
      headers,
      ...(!request.head ? { stream: () => file.stream(start, end) } : {}),
    };
  }
}
