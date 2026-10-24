import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { HymnsController } from "./hymns.controller";
import { HymnsRepository } from "./hymns.repository";
import { HymnsService } from "./hymns.service";

@Module({
  imports: [MediaModule],
  controllers: [HymnsController],
  providers: [HymnsRepository, HymnsService],
  exports: [HymnsService],
})
export class HymnsModule {}
