import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminRequest } from "../auth/admin-request";
import { AdminGuard } from "../auth/admin.guard";
import { PageQuery } from "../common/pagination.dto";
import { DeleteWordDto, RevisionDto, SaveWordDto } from "./dictionary.dto";
import { DictionaryService } from "./dictionary.service";

@Controller("api/admin/dictionary")
@UseGuards(AdminGuard)
export class DictionaryController {
  constructor(
    @Inject(DictionaryService) private readonly service: DictionaryService,
  ) {}
  @Get() list(@Query() query: PageQuery) {
    return this.service.list(query);
  }
  @Put() save(@Body() body: SaveWordDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
  @Delete() delete(@Body() body: DeleteWordDto, @Req() request: AdminRequest) {
    return this.service.delete(body, request.adminSession.username);
  }
  @Post("publish") @HttpCode(200) publish(
    @Body() body: RevisionDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.publish(body, request.adminSession.username);
  }
}
