import { HttpException, Inject, Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import type { CloudPlaylist } from "../domain/playlists";
import { HymnsService } from "../hymns/hymns.service";
import { StateRepository } from "../infrastructure/state.repository";
import { DeletePlaylistDto, SavePlaylistDto } from "./playlists.dto";
import { PlaylistsRepository } from "./playlists.repository";

@Injectable()
export class PlaylistsService {
  constructor(
    @Inject(PlaylistsRepository)
    private readonly repository: PlaylistsRepository,
    @Inject(HymnsService) private readonly hymns: HymnsService,
    @Inject(StateRepository) private readonly state: StateRepository,
  ) {}

  list() {
    return this.repository.read();
  }

  async published() {
    const [catalog, hymns] = await Promise.all([
      this.repository.read(),
      this.hymns.published(),
    ]);
    const publishedIds = new Set(hymns.items.map((item) => item.id));
    return {
      revision: catalog.revision,
      items: catalog.items
        .filter((item) => item.enabled)
        .map((item) => ({
          ...item,
          hymnIds: item.hymnIds.filter((id) => publishedIds.has(id)),
        })),
    };
  }

  async save(body: SavePlaylistDto, actor: string) {
    const id = body.id ?? `playlist-${randomUUID()}`;
    return this.state.update("playlist.save", actor, id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("歌单资料已被更新，请刷新后重新操作", 409);
      if (body.id && !catalog.items.some((item) => item.id === body.id))
        throw new HttpException("歌单不存在", 404);
      const hymnIds = new Set(await this.hymns.catalogIds());
      if (body.hymnIds.some((hymnId) => !hymnIds.has(hymnId)))
        throw new HttpException("歌单中包含不存在的诗歌，请重新选择", 400);
      const item: CloudPlaylist = {
        id,
        titleZh: body.titleZh.trim(),
        titleEn: body.titleEn.trim(),
        descriptionZh: body.descriptionZh.trim(),
        descriptionEn: body.descriptionEn.trim(),
        cover: body.cover,
        hymnIds: [...body.hymnIds],
        enabled: body.enabled,
      };
      const next = {
        revision: catalog.revision + 1,
        items: body.id
          ? catalog.items.map((row) => (row.id === id ? item : row))
          : [...catalog.items, item],
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, item, revision: next.revision, backup };
    });
  }

  async remove(body: DeletePlaylistDto, actor: string) {
    return this.state.update("playlist.delete", actor, body.id, async () => {
      const catalog = await this.repository.read();
      if (body.revision !== catalog.revision)
        throw new HttpException("歌单资料已被更新，请刷新后重新删除", 409);
      if (!catalog.items.some((item) => item.id === body.id))
        throw new HttpException("歌单不存在", 404);
      const next = {
        revision: catalog.revision + 1,
        items: catalog.items.filter((item) => item.id !== body.id),
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, revision: next.revision, backup };
    });
  }
}
