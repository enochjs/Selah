import { Module } from "@nestjs/common";
import { UsageController } from "./usage.controller";
import { UsageRepository } from "./usage.repository";
import { UsageService } from "./usage.service";
import { UsageRateGuard } from "./usage-rate.guard";
@Module({
  controllers: [UsageController],
  providers: [UsageRepository, UsageService, UsageRateGuard],
})
export class UsageModule {}
