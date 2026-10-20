import { Controller, Get, Inject, Param, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import type { MediaAddress } from "./media.types";
import { MediaService } from "./media.service";

@Controller("api/audio")
export class MediaController {
  constructor(@Inject(MediaService) private readonly service: MediaService) {}

  @Get("resources/:name") resources(
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.respond({ kind: "resources", name }, request, response);
  }

  @Get("aligned/:name") aligned(
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.respond({ kind: "aligned", name }, request, response);
  }

  @Get("bible/:version/:folder/:name") bible(
    @Param("version") version: string,
    @Param("folder") folder: string,
    @Param("name") name: string,
    @Req() request: Request,
    @Res() response: Response,
  ) {
    return this.respond(
      { kind: "bible", version, folder, name },
      request,
      response,
    );
  }

  private async respond(
    address: MediaAddress,
    request: Request,
    response: Response,
  ) {
    const ifNoneMatch = request.headers["if-none-match"];
    const ifRange = request.headers["if-range"];
    const plan = await this.service.prepare(address, {
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
