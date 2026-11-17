import type { AppRelease } from "../domain/app-updates";
import { UpdateFailure } from "../domain/app-updates";
export function officialStoreUrl(release: AppRelease): string {
  if (release.artifact || !release.storeUrl || release.channel === "direct")
    throw new UpdateFailure("unsupported");
  let url: URL;
  try {
    url = new URL(release.storeUrl);
  } catch {
    throw new UpdateFailure("integrity");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port)
    throw new UpdateFailure("integrity");
  const valid =
    release.platform === "android"
      ? release.channel === "store" &&
        url.hostname === "play.google.com" &&
        url.pathname === "/store/apps/details" &&
        url.searchParams.get("id") === release.appId
      : release.channel === "testflight"
        ? url.hostname === "testflight.apple.com" &&
          /^\/join\/[A-Za-z0-9]+$/.test(url.pathname)
        : release.channel === "store" &&
          url.hostname === "apps.apple.com" &&
          /\/id\d+(?:\/|$)/.test(url.pathname);
  if (!valid) throw new UpdateFailure("integrity");
  return url.toString();
}
