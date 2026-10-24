import { HttpException, Inject, Injectable } from "@nestjs/common";
import { pageOf } from "../common/pagination.dto";
import { StateRepository } from "../infrastructure/state.repository";
import { MediaRepository } from "../media/media.repository";
import { HymnsQuery, SaveHymnDto } from "./hymns.dto";
import { HymnsRepository } from "./hymns.repository";

@Injectable()
export class HymnsService {
  constructor(
    @Inject(HymnsRepository) private readonly repository: HymnsRepository,
    @Inject(StateRepository) private readonly state: StateRepository,
    @Inject(MediaRepository) private readonly media: MediaRepository,
  ) {}

  private async catalog() {
    const catalog = await this.repository.read();
    const items = await Promise.all(
      catalog.items.map(async (item) => {
        const match = item.audioPath.match(
          /^\/api\/audio\/resources\/([a-f0-9]{64}\.mp3)$/,
        );
        const audioAvailable = Boolean(
          match &&
          (await this.media.downloadMetadata({
            kind: "resources",
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
            (!query.status || item.enabled === (query.status === "enabled")),
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
      const next = {
        ...catalog,
        revision: catalog.revision + 1,
        items: catalog.items.map((row) => (row.id === item.id ? updated : row)),
      };
      const backup = await this.repository.publish(catalog, next);
      return { ok: true, revision: next.revision, backup };
    });
  }
}
