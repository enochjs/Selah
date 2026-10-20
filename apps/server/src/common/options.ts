import path from "node:path";

export const SERVER_OPTIONS = Symbol("SERVER_OPTIONS");

export interface ServerOptions {
  contentRoot: string;
  mediaRoot: string;
  stateRoot: string;
  auditRoot: string;
  timingRoot: string;
  alignmentRoot: string;
  legacyRoot?: string;
  publicRoot: string;
  checkScript: string;
  username: string;
  password: string;
}

export function resolveOptions(
  options: Partial<ServerOptions> = {},
): ServerOptions {
  const root = path.resolve(__dirname, "../../../..");
  const configuredPath = (variable: string, fallback: string) =>
    path.resolve(root, process.env[variable] || fallback);
  return {
    contentRoot: configuredPath("CONTENT_ROOT", "packages/content/data"),
    mediaRoot: configuredPath("MEDIA_ROOT", "storage/resources/media"),
    stateRoot: configuredPath("ADMIN_STATE_ROOT", "storage/admin"),
    auditRoot: configuredPath(
      "RESOURCE_AUDIT_ROOT",
      "storage/resources/audits",
    ),
    timingRoot: configuredPath(
      "TIMING_ROOT",
      "storage/resources/timing-overrides",
    ),
    alignmentRoot: configuredPath("ALIGNMENT_ROOT", "storage/alignment"),
    legacyRoot: process.env.BIBLE_RESOURCE_ROOT
      ? configuredPath("BIBLE_RESOURCE_ROOT", "")
      : undefined,
    publicRoot: path.join(root, "apps/server/public"),
    checkScript: path.join(root, "packages/content/scripts/check-content.mjs"),
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "",
    ...options,
  };
}

export function resolveListenOptions(): { port: number; host: string } {
  const port = Number(process.env.PORT || process.env.ADMIN_PORT || 8890);
  const host = (
    process.env.HOST ||
    process.env.ADMIN_HOST ||
    "127.0.0.1"
  ).trim();
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error("PORT or ADMIN_PORT must be an integer from 0 to 65535.");
  }
  if (!host) throw new Error("HOST or ADMIN_HOST cannot be blank.");
  return { port, host };
}
