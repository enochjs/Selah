import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { WebsiteService } from "./website.service";

@Controller()
export class WebsiteController {
  constructor(
    @Inject(WebsiteService) private readonly service: WebsiteService,
  ) {}

  @Get() index(@Res() response: Response) {
    return this.send("index.html", response);
  }
  @Get("privacy") privacy(@Res() response: Response) {
    return this.send("privacy.html", response);
  }
  @Get("terms") terms(@Res() response: Response) {
    return this.send("terms.html", response);
  }
  @Get("website/:name") asset(
    @Param("name") name: string,
    @Res() response: Response,
  ) {
    return this.send(name, response);
  }

  private async send(name: string, response: Response) {
    const file = await this.service.file(name);
    response.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cache-Control": "no-cache",
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
    response.type(file.type).send(file.bytes);
  }
}
