import { Module } from "@nestjs/common";
import { HymnsModule } from "../hymns/hymns.module";
import { WebsiteController } from "./website.controller";
import { WebsiteService } from "./website.service";
import { WebsiteRepository } from "./website.repository";

@Module({
  imports: [HymnsModule],
  controllers: [WebsiteController],
  providers: [WebsiteService, WebsiteRepository],
})
export class WebsiteModule {}
