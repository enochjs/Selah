import { Module } from "@nestjs/common";
import { MediaModule } from "../media/media.module";
import { HymnsController } from "./hymns.controller";
import { HymnsRepository } from "./hymns.repository";
import { HymnsService } from "./hymns.service";
import { PublishedHymnsController } from "./published-hymns.controller";
import { PublishedHymnAudioController } from "./published-hymn-audio.controller";

@Module({
  imports: [MediaModule],
  controllers: [
    HymnsController,
    PublishedHymnsController,
    PublishedHymnAudioController,
  ],
  providers: [HymnsRepository, HymnsService],
  exports: [HymnsService],
})
export class HymnsModule {}
