import { Controller, Get, Inject, Param, Res } from "@nestjs/common";
import type { Response } from "express";
import { SystemService } from "./system.service";

@Controller("admin")
export class PublicController {
  constructor(@Inject(SystemService) private readonly service: SystemService) {}
  @Get() async index(@Res() response: Response) {
    const file = await this.service.publicFile("index.html");
    response.type(file.type).send(file.bytes);
  }
  @Get(":name") async file(
    @Param("name") name: string,
    @Res() response: Response,
  ) {
    const file = await this.service.publicFile(name);
    response.type(file.type).send(file.bytes);
  }
}
