import { Module } from "@nestjs/common";
import { WebsiteController } from "./website.controller";
import { WebsiteService } from "./website.service";
import { WebsiteRepository } from "./website.repository";

@Module({
  controllers: [WebsiteController],
  providers: [WebsiteService, WebsiteRepository],
})
export class WebsiteModule {}
