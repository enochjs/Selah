import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Put,
  Post,
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRequest } from "../auth/admin-request";
import {
  HymnsQuery,
  SaveHymnDto,
  UploadHymnDto,
  ReviewHymnDto,
  DeleteHymnDto,
} from "./hymns.dto";
import { HymnsService } from "./hymns.service";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { mediaRequest, sendMedia } from "../media/media-http";

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

  @Delete() remove(@Body() body: DeleteHymnDto, @Req() request: AdminRequest) {
    return this.service.remove(body, request.adminSession.username);
  }

  @Post("upload")
  @UseInterceptors(
    FileInterceptor("audio", {
      limits: {
        fileSize: 30 * 1024 * 1024,
        files: 1,
        fields: 10,
        fieldSize: 160000,
      },
    }),
  )
  upload(
    @Body() body: UploadHymnDto,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Req() request: AdminRequest,
  ) {
    return this.service.upload(
      body,
      file ? { bytes: file.buffer, name: file.originalname } : undefined,
      request.adminSession.username,
    );
  }

  @Put("review")
  review(@Body() body: ReviewHymnDto, @Req() request: AdminRequest) {
    return this.service.review(body, request.adminSession.username);
  }

  @Get(":id/audio")
  async preview(
    @Param("id") id: string,
    @Req() request: AdminRequest,
    @Res() response: Response,
  ) {
    sendMedia(response, await this.service.preview(id, mediaRequest(request)));
  }
}
