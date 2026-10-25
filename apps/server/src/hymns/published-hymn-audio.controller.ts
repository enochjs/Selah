import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { mediaRequest, sendMedia } from "../media/media-http";
import { HymnsService } from "./hymns.service";

@Controller("api/audio/hymns")
export class PublishedHymnAudioController {
  constructor(@Inject(HymnsService) private readonly service: HymnsService) {}

  @Get(":name")
  async audio(
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    sendMedia(
      response,
      await this.service.publishedAudio(name, mediaRequest(request)),
    );
  }
}
