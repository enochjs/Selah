import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";

@Injectable()
export class UsageRateGuard implements CanActivate {
  private readonly requests = new Map<string, number>();
  private window = 0;
  canActivate(context: ExecutionContext) {
    const window = Math.floor(Date.now() / 60000);
    if (window !== this.window) {
      this.requests.clear();
      this.window = window;
    }
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.is("application/json"))
      throw new HttpException("请使用 JSON 请求", 415);
    const body: unknown = request.body;
    const deviceId =
      body &&
      typeof body === "object" &&
      "deviceId" in body &&
      typeof body.deviceId === "string"
        ? body.deviceId.toLowerCase()
        : "";
    const device =
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(
        deviceId,
      )
        ? deviceId
        : "invalid";
    this.count(`ingress:${request.ip || "unknown"}`, 10000);
    this.count(`device:${device}`, 120);
    return true;
  }
  private count(key: string, limit: number) {
    const count = (this.requests.get(key) ?? 0) + 1;
    if (
      count > limit ||
      (!this.requests.has(key) && this.requests.size >= 20000)
    )
      throw new HttpException("请求过于频繁，请稍后重试", 429);
    this.requests.set(key, count);
  }
}
