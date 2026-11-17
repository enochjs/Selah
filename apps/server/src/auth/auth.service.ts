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
import { StateRepository } from "../infrastructure/state.repository";

@Injectable()
export class AuthService implements OnModuleInit {
  private credentials!: Credentials;
  private readonly sessions = new Map<string, Session>();
  private readonly failures = new Map<
    string,
    { count: number; until: number }
  >();
  private passwordChanges: Promise<unknown> = Promise.resolve();
  generatedPassword?: string;
  private readonly ttl = SESSION_TTL_MS;
  constructor(
    @Inject(CredentialsRepository)
    private readonly repository: CredentialsRepository,
    @Inject(SERVER_OPTIONS) private readonly options: ServerOptions,
    @Inject(StateRepository) private readonly state: StateRepository,
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
    this.checkAttempts(ip);
    const passwordMatches = this.matchesPassword(password);
    if (username.trim() !== this.credentials.username || !passwordMatches) {
      this.recordFailure(ip);
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
  private matchesPassword(password: string) {
    return timingSafeEqual(
      scryptSync(password, this.credentials.salt, 64),
      Buffer.from(this.credentials.hash, "hex"),
    );
  }
  private checkAttempts(key: string) {
    if ((this.failures.get(key)?.count || 0) >= 5)
      throw new HttpException("密码尝试过多，请 15 分钟后再试", 429);
  }
  private recordFailure(key: string) {
    const failure = this.failures.get(key);
    if (this.failures.size >= 10000)
      this.failures.delete(this.failures.keys().next().value!);
    this.failures.set(key, {
      count: (failure?.count || 0) + 1,
      until: failure?.until || Date.now() + 15 * 60 * 1000,
    });
  }
  changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
    ip: string,
  ) {
    const result = this.passwordChanges.then(async () => {
      // Recheck after queued changes, which can invalidate the caller's session.
      const session = this.session(token);
      if (!session) throw new HttpException("请重新登录管理后台", 401);
      const key = `password:${ip}`;
      this.checkAttempts(key);
      if (!this.matchesPassword(currentPassword)) {
        this.recordFailure(key);
        throw new HttpException("当前密码不正确", 400);
      }
      if (currentPassword === newPassword)
        throw new HttpException("新密码不能与当前密码相同", 400);
      const previous = this.credentials;
      const salt = randomBytes(24).toString("hex");
      const next: Credentials = {
        username: previous.username,
        salt,
        hash: scryptSync(newPassword, salt, 64).toString("hex"),
      };
      await this.repository.write(next);
      try {
        await this.state.update(
          "auth.password.change",
          session.username,
          session.username,
          () => {},
        );
      } catch (error) {
        try {
          await this.repository.write(previous);
        } catch {
          // The new hash is already durable. Keep memory and sessions consistent with it.
          this.credentials = next;
          this.sessions.clear();
          throw new HttpException(
            "密码已保存，但操作日志写入失败，请使用新密码重新登录",
            503,
          );
        }
        throw error;
      }
      this.credentials = next;
      this.sessions.clear();
      this.failures.delete(key);
    });
    this.passwordChanges = result.catch(() => {});
    return result;
  }
  logout(token: string) {
    this.sessions.delete(token);
  }
}
