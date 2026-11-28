import { HttpException, Inject, Injectable } from "@nestjs/common";
import { WebsiteRepository } from "./website.repository";
import { HymnsService } from "../hymns/hymns.service";
import { sharedHymnPage } from "./shared-hymn-page";

const files: Readonly<Record<string, string>> = {
  "index.html": "text/html; charset=utf-8",
  "privacy.html": "text/html; charset=utf-8",
  "terms.html": "text/html; charset=utf-8",
  "site.css": "text/css; charset=utf-8",
  "site.js": "text/javascript; charset=utf-8",
  "icon.svg": "image/svg+xml",
  "install-qr.svg": "image/svg+xml",
  "lake.webp": "image/webp",
  "reader.webp": "image/webp",
  "hymns.webp": "image/webp",
  "social.jpg": "image/jpeg",
};

@Injectable()
export class WebsiteService {
  constructor(
    @Inject(WebsiteRepository) private readonly repository: WebsiteRepository,
    @Inject(HymnsService) private readonly hymns: HymnsService,
  ) {}

  async file(name: string) {
    if (!Object.hasOwn(files, name)) throw new HttpException("页面不存在", 404);
    return { bytes: await this.repository.read(name), type: files[name] };
  }

  async hymnPage(id: string, english: boolean) {
    const hymn = await this.hymns.sharedRecording(id);
    return { available: !!hymn, html: sharedHymnPage(hymn, english) };
  }
}
