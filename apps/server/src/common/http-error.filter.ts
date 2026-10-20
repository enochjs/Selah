import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
} from "@nestjs/common";
import type { Response } from "express";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(error: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : typeof error === "object" &&
            error !== null &&
            "status" in error &&
            typeof error.status === "number"
          ? error.status
          : 500;
    const payload = error instanceof HttpException ? error.getResponse() : null;
    const message =
      typeof payload === "string"
        ? payload
        : payload && typeof payload === "object" && "message" in payload
          ? payload.message
          : status === 500
            ? "服务器处理失败，请稍后重试"
            : "请求无效";
    response.status(status).json({ error: message });
  }
}
