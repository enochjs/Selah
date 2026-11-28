import { Controller, Get, Inject, Param, Query, Res } from "@nestjs/common";
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
  @Get("hymns/:id") async hymn(
    @Param("id") id: string,
    @Query("lang") lang: unknown,
    @Res() response: Response,
  ) {
    const page = await this.service.hymnPage(id, lang === "en");
    this.setPageHeaders(response, "no-store");
    response
      .status(page.available ? 200 : 404)
      .type("html")
      .send(page.html);
  }
  @Get("website/:name") asset(
    @Param("name") name: string,
    @Res() response: Response,
  ) {
    return this.send(name, response);
  }

  private async send(name: string, response: Response) {
    const file = await this.service.file(name);
    this.setPageHeaders(response, "no-cache");
    response.type(file.type).send(file.bytes);
  }

  private setPageHeaders(response: Response, cacheControl: string) {
    response.set({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Frame-Options": "DENY",
      "Cache-Control": cacheControl,
      "Content-Security-Policy":
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    });
  }
}
