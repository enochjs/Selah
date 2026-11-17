import {
  Body,
  Controller,
  Delete,
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
import type { Request, Response } from "express";
import { AdminGuard } from "../auth/admin.guard";
import { AdminRequest } from "../auth/admin-request";
import { EmptyDto } from "../common/empty.dto";
import { DeleteUpdateDto, SaveUpdateDto, UpdateQuery } from "./app-updates.dto";
import { AppUpdatesService } from "./app-updates.service";
@Controller("api/admin/app-updates")
@UseGuards(AdminGuard)
export class AdminAppUpdatesController {
  constructor(
    @Inject(AppUpdatesService) private readonly service: AppUpdatesService,
  ) {}
  @Get() list(@Query() query: EmptyDto) {
    void query;
    return this.service.list();
  }
  @Put() save(@Body() body: SaveUpdateDto, @Req() request: AdminRequest) {
    return this.service.save(body, request.adminSession.username);
  }
  @Delete() remove(
    @Body() body: DeleteUpdateDto,
    @Req() request: AdminRequest,
  ) {
    return this.service.remove(body, request.adminSession.username);
  }
  @Post("artifacts")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 200 * 1024 * 1024, files: 1, fields: 0 },
    }),
  )
  upload(
    @Body() body: EmptyDto,
    @UploadedFile() file: { buffer: Buffer; originalname: string } | undefined,
    @Req() request: AdminRequest,
  ) {
    void body;
    return this.service.upload(
      file?.buffer,
      file?.originalname,
      request.adminSession.username,
    );
  }
}
@Controller("api/app-updates")
export class AppUpdatesController {
  constructor(
    @Inject(AppUpdatesService) private readonly service: AppUpdatesService,
  ) {}
  @Get() latest(
    @Query() query: UpdateQuery,
    @Res({ passthrough: true }) response: Response,
  ) {
    response.set("Cache-Control", "no-store");
    return this.service.latest(query);
  }
  @Get("artifacts/:name") async artifact(
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const ifRange = request.headers["if-range"],
      ifNoneMatch = request.headers["if-none-match"];
    const plan = await this.service.artifact(name, {
      head: request.method === "HEAD",
      range: request.headers.range,
      ifRange: typeof ifRange === "string" ? ifRange : undefined,
      ifNoneMatch: typeof ifNoneMatch === "string" ? ifNoneMatch : undefined,
    });
    response.set(plan.headers).status(plan.status);
    if (!plan.stream) {
      response.end();
      return;
    }
    const stream = plan.stream();
    stream.on("error", () => response.destroy());
    response.on("close", () => stream.destroy());
    stream.pipe(response);
  }
}
