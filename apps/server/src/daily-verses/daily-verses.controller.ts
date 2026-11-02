import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRequest } from "../auth/admin-request";
import { DailyVersesService } from "./daily-verses.service";
import {
  DailyVerseQuery,
  ReviewDailyVerseDto,
  SaveDailyVerseDto,
  UploadDailyImageDto,
} from "./daily-verses.dto";
@Controller("api/admin/daily-verses")
@UseGuards(AdminGuard)
export class DailyVersesController {
  constructor(
    @Inject(DailyVersesService) private readonly service: DailyVersesService,
  ) {}
  @Get() list(@Query() query: DailyVerseQuery) {
    return this.service.list(query);
  }
  @Put() save(@Body() body: SaveDailyVerseDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
  @Put("review") review(
    @Body() body: ReviewDailyVerseDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.review(body, request.adminSession.username);
  }
  @Get(":id/preview") preview(@Param("id") id: string) {
    return this.service.preview(id);
  }
  @Post("images")
  @UseInterceptors(
    FileInterceptor("image", {
      limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1,
        fields: 7,
        fieldSize: 4096,
      },
    }),
  )
  upload(
    @Body() body: UploadDailyImageDto,
    @UploadedFile() file: { buffer: Buffer } | undefined,
    @Req() request: AdminRequest,
  ) {
    return this.service.upload(
      body,
      file?.buffer,
      request.adminSession.username,
    );
  }
  @Get("images/:file") async image(
    @Param("file") file: string,
    @Res() response: Response,
  ) {
    response.type("image/jpeg").send(await this.service.image(file, false));
  }
}
@Controller("api/daily-verses")
export class PublishedDailyVersesController {
  constructor(
    @Inject(DailyVersesService) private readonly service: DailyVersesService,
  ) {}
  @Get() async list(@Res({ passthrough: true }) response: Response) {
    response.set("Cache-Control", "no-store");
    return this.service.published();
  }
  @Get("images/:file") async image(
    @Param("file") file: string,
    @Res() response: Response,
  ) {
    response
      .set({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" })
      .type("image/jpeg")
      .send(await this.service.image(file, true));
  }
}
