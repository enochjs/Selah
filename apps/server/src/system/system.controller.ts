import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AdminRequest } from "../auth/admin-request";
import { AdminGuard } from "../auth/admin.guard";
import { EmptyDto } from "../common/empty.dto";
import { PageQuery } from "../common/pagination.dto";
import { SystemService } from "./system.service";

@Controller("api/admin")
@UseGuards(AdminGuard)
export class SystemController {
  constructor(@Inject(SystemService) private readonly service: SystemService) {}
  @Get("audit") audit(@Query() query: PageQuery) {
    return this.service.audit(query);
  }
  @Get("system") info() {
    return this.service.info();
  }
  @Get("export") export(@Res({ passthrough: true }) response: Response) {
    response.setHeader(
      "Content-Disposition",
      `attachment; filename="selah-admin-${new Date().toISOString().slice(0, 10)}.json"`,
    );
    return this.service.export();
  }
  @Post("check") @HttpCode(200) check(
    @Body() _body: EmptyDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.check(request.adminSession.username);
  }
}
