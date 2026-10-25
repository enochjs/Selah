import { Controller, Get, Header, Inject } from "@nestjs/common";
import { HymnsService } from "./hymns.service";

@Controller("api/hymns")
export class PublishedHymnsController {
  constructor(@Inject(HymnsService) private readonly service: HymnsService) {}

  @Get()
  @Header("Cache-Control", "no-store")
  list() {
    return this.service.published();
  }
}
