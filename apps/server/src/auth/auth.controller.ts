import { sessionCookie } from "./session-cookie";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { EmptyDto } from "../common/empty.dto";
import { AdminRequest } from "./admin-request";
import { AdminGuard } from "./admin.guard";
import { AuthService } from "./auth.service";
import { LoginDto } from "./login.dto";

@Controller("api/admin")
@UseGuards(AdminGuard)
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post("login") @HttpCode(200) login(
    @Body() body: LoginDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    const session = this.auth.login(
      body.username,
      body.password,
      request.socket.remoteAddress || "unknown",
    );
    response.setHeader(
      "Set-Cookie",
      sessionCookie(session.token, request.secure),
    );
    return { username: session.username, csrf: session.csrf };
  }
  @Get("session") session(@Req() request: AdminRequest) {
    return {
      username: request.adminSession.username,
      csrf: request.adminSession.csrf,
    };
  }
  @Post("logout") @HttpCode(200) logout(
    @Body() _body: EmptyDto,
    @Req() request: AdminRequest,
    @Res({ passthrough: true }) response: Response,
  ) {
    this.auth.logout(request.adminSession.token);
    response.setHeader("Set-Cookie", sessionCookie("", request.secure, true));
    return { ok: true };
  }
}
