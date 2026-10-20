import { SESSION_TTL_MS } from "./session-policy";
import {
  HttpException,
  Inject,
  Injectable,
  OnModuleInit,
} from "@nestjs/common";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { SERVER_OPTIONS, ServerOptions } from "../common/options";
import { Credentials, Session } from "../domain/models";
import { CredentialsRepository } from "../infrastructure/credentials.repository";

@Injectable()
export class AuthService implements OnModuleInit {
  private credentials!: Credentials;
  private readonly sessions = new Map<string, Session>();
  private readonly failures = new Map<
    string,
    { count: number; until: number }
  >();
  generatedPassword?: string;
  private readonly ttl = SESSION_TTL_MS;
  constructor(
    @Inject(CredentialsRepository)
    private readonly repository: CredentialsRepository,
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
  ) {}
  async onModuleInit() {
    const credentials = await this.repository.read();
    if (credentials) {
      this.credentials = credentials;
      return;
    }
    const password =
      this.options.password || randomBytes(18).toString("base64url");
    if (password.length < 12 || password.length > 512 || !password.trim())
      throw new Error(
        "ADMIN_PASSWORD must contain 12–512 characters and cannot be blank.",
      );
    const salt = randomBytes(24).toString("hex");
    this.credentials = {
      username: this.options.username,
      salt,
      hash: scryptSync(password, salt, 64).toString("hex"),
    };
    await this.repository.write(this.credentials);
    if (!this.options.password) this.generatedPassword = password;
  }
  private prune() {
    const now = Date.now();
    for (const [key, value] of this.failures)
      if (value.until <= now) this.failures.delete(key);
    for (const [key, value] of this.sessions)
      if (value.expires <= now) this.sessions.delete(key);
  }
  session(token: string | undefined) {
    this.prune();
    return token ? this.sessions.get(token) : undefined;
  }
  login(username: string, password: string, ip: string) {
    this.prune();
    const failure = this.failures.get(ip);
    if (failure && failure.count >= 5)
      throw new HttpException("登录尝试过多，请 15 分钟后再试", 429);
    const candidate = scryptSync(password, this.credentials.salt, 64);
    if (
      username.trim() !== this.credentials.username ||
      !timingSafeEqual(candidate, Buffer.from(this.credentials.hash, "hex"))
    ) {
      if (this.failures.size >= 10000)
        this.failures.delete(this.failures.keys().next().value!);
      this.failures.set(ip, {
        count: (failure?.count || 0) + 1,
        until: failure?.until || Date.now() + 15 * 60 * 1000,
      });
      throw new HttpException("账号或密码不正确", 401);
    }
    this.failures.delete(ip);
    if (this.sessions.size >= 100)
      this.sessions.delete(this.sessions.keys().next().value!);
    const session: Session = {
      token: randomBytes(32).toString("hex"),
      username: this.credentials.username,
      csrf: randomBytes(32).toString("hex"),
      expires: Date.now() + this.ttl,
    };
    this.sessions.set(session.token, session);
    return session;
  }
  logout(token: string) {
    this.sessions.delete(token);
  }
}
