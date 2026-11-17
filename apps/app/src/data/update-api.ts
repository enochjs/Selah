import {
  parseAppRelease,
  UpdateFailure,
  type InstalledApp,
} from "../domain/app-updates";

export async function fetchUpdateRelease(
  installed: InstalledApp,
  endpoint: string | null,
  request: (url: string, init?: RequestInit) => Promise<Response> = fetch,
) {
  if (installed.platform === "web") throw new UpdateFailure("unsupported");
  let base: URL;
  try {
    base = new URL(endpoint || "");
    if (base.protocol !== "https:" || base.username || base.password)
      throw new Error();
  } catch {
    throw new UpdateFailure("unavailable");
  }
  const url = new URL("/api/app-updates", base);
  url.search = new URLSearchParams({
    platform: installed.platform,
    channel: installed.channel,
    buildNumber: String(installed.buildNumber),
  }).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await request(url.toString(), {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!response.ok)
      throw new UpdateFailure(
        response.status === 404 ? "unavailable" : "network",
      );
    const body: unknown = await response.json();
    if (!body || typeof body !== "object" || !("release" in body))
      throw new UpdateFailure("integrity");
    return body.release === null
      ? null
      : parseAppRelease(body.release, installed);
  } catch (error) {
    throw error instanceof UpdateFailure ? error : new UpdateFailure("network");
  } finally {
    clearTimeout(timeout);
  }
}
