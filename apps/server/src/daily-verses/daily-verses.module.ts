import { Module } from "@nestjs/common";
import {
  DailyVersesController,
  PublishedDailyVersesController,
} from "./daily-verses.controller";
import { DailyVersesRepository } from "./daily-verses.repository";
import { DailyVersesService } from "./daily-verses.service";
@Module({
  controllers: [DailyVersesController, PublishedDailyVersesController],
  providers: [DailyVersesRepository, DailyVersesService],
})
export class DailyVersesModule {}
