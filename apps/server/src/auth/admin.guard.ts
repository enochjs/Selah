import { sessionToken } from "./session-cookie";
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { AdminRequest } from "./admin-request";
import { AuthService } from "./auth.service";

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const read = ["GET", "HEAD"].includes(request.method);
    if (!read && request.headers.origin) {
      let origin: URL;
      try {
        origin = new URL(request.headers.origin);
      } catch {
        throw new HttpException("请求来源无效", 403);
      }
      if (
        origin.host !== request.headers.host ||
        !["http:", "https:"].includes(origin.protocol)
      )
        throw new HttpException("请求来源无效", 403);
    }
    if (request.method === "POST" && request.path === "/api/admin/login")
      return true;
    const session = this.auth.session(sessionToken(request.headers.cookie));
    if (!session) throw new HttpException("请先登录管理后台", 401);
    if (!read && request.headers["x-csrf-token"] !== session.csrf)
      throw new HttpException("安全校验失败，请重新登录", 403);
    request.adminSession = session;
    return true;
  }
}
