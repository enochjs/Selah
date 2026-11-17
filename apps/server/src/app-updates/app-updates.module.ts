import { Module } from "@nestjs/common";
import {
  AdminAppUpdatesController,
  AppUpdatesController,
} from "./app-updates.controller";
import { AppUpdatesRepository } from "./app-updates.repository";
import { AppUpdatesService } from "./app-updates.service";
@Module({
  controllers: [AdminAppUpdatesController, AppUpdatesController],
  providers: [AppUpdatesRepository, AppUpdatesService],
})
export class AppUpdatesModule {}
