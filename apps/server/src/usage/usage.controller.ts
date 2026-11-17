import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { UsageBatchDto, UsageQueryDto } from "./usage.dto";
import { UsageService } from "./usage.service";
import { UsageRateGuard } from "./usage-rate.guard";

@Controller("api")
export class UsageController {
  constructor(@Inject(UsageService) private readonly service: UsageService) {}
  @Post("usage")
  @HttpCode(202)
  @UseGuards(UsageRateGuard)
  record(@Body() body: UsageBatchDto) {
    return this.service.record(body);
  }
  @Get("admin/usage")
  @UseGuards(AdminGuard)
  dashboard(@Query() query: UsageQueryDto) {
    return this.service.dashboard(query.days);
  }
}
