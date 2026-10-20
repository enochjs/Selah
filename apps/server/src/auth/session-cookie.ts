import { SESSION_TTL_MS } from "./session-policy";

export function sessionToken(cookie: string | undefined): string | undefined {
  return cookie?.match(/(?:^|;\s*)selah_admin=([a-f0-9]{64})(?:;|$)/)?.[1];
}

export function sessionCookie(
  token: string,
  secure: boolean,
  clear = false,
): string {
  return `selah_admin=${clear ? "" : token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=${clear ? 0 : SESSION_TTL_MS / 1000}${secure ? "; Secure" : ""}`;
}
