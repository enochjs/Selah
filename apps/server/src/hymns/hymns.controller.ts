import {
  Body,
  Controller,
  Get,
  Inject,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRequest } from "../auth/admin-request";
import { HymnsQuery, SaveHymnDto } from "./hymns.dto";
import { HymnsService } from "./hymns.service";

@Controller("api/admin/hymns")
@UseGuards(AdminGuard)
export class HymnsController {
  constructor(@Inject(HymnsService) private readonly service: HymnsService) {}
  @Get() list(@Query() query: HymnsQuery) {
    return this.service.list(query);
  }
  @Put() save(@Body() body: SaveHymnDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
}
