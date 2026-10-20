import { Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { PublicController } from "./public.controller";
import { SystemController } from "./system.controller";
import { SystemService } from "./system.service";

@Module({
  controllers: [SystemController, PublicController, HealthController],
  providers: [SystemService],
})
export class SystemModule {}
