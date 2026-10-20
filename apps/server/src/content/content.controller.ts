import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { ContentQuery } from "./content-query.dto";
import { ContentService } from "./content.service";

@Controller("api/admin")
@UseGuards(AdminGuard)
export class ContentController {
  constructor(
    @Inject(ContentService) private readonly service: ContentService,
  ) {}
  @Get("books") books() {
    return { items: this.service.books() };
  }
  @Get("overview") overview() {
    return this.service.overview();
  }
  @Get("scripture") scripture(@Query() query: ContentQuery) {
    return this.service.scripture(query);
  }
  @Get("recordings") recordings(@Query() query: ContentQuery) {
    return this.service.recordings(query);
  }
  @Get("recordings/:key") recording(@Param("key") key: string) {
    return this.service.recording(key);
  }
}
