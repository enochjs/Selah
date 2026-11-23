import {
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Req,
  Res,
} from "@nestjs/common";
import type { Request, Response } from "express";
import { mediaRequest, sendMedia } from "../media/media-http";
import { EnglishLessonsService } from "./english-lessons.service";

@Controller("api/english-lessons")
export class EnglishLessonsController {
  constructor(
    @Inject(EnglishLessonsService)
    private readonly service: EnglishLessonsService,
  ) {}

  @Get()
  @Header("Cache-Control", "no-cache")
  catalog() {
    return this.service.catalog();
  }

  @Get("video/:name")
  async video(
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    const plan = await this.service.video(name, mediaRequest(request));
    sendMedia(response, plan);
  }
}
