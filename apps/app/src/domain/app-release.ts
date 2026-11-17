import {
  UpdateFailure,
  type AppRelease,
  type InstalledApp,
  type UpdatePreferences,
} from "./app-updates";

const day = 86_400_000;
function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new UpdateFailure("integrity");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number) {
  if (typeof value !== "string" || !value.trim() || value.length > max)
    throw new UpdateFailure("integrity");
  return value;
}
function integer(value: unknown, min = 1) {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min)
    throw new UpdateFailure("integrity");
  return value;
}
export function parseAppRelease(
  value: unknown,
  installed: InstalledApp,
): AppRelease {
  const item = record(value);
  if (
    item.platform !== installed.platform ||
    item.channel !== installed.channel ||
    item.appId !== installed.appId
  )
    throw new UpdateFailure("incompatible");
  const version = text(item.version, 40);
  if (!/^\d+\.\d+\.\d+(?:-[\da-zA-Z.-]+)?$/.test(version))
    throw new UpdateFailure("integrity");
  const buildNumber = integer(item.buildNumber),
    minSupportedBuild = integer(item.minSupportedBuild);
  if (buildNumber > 2_100_000_000 || minSupportedBuild > buildNumber)
    throw new UpdateFailure("integrity");
  if (item.importance !== "normal" && item.importance !== "important")
    throw new UpdateFailure("integrity");
  const publishedAt = text(item.publishedAt, 40);
  if (
    !/^\d{4}-\d{2}-\d{2}T/.test(publishedAt) ||
    !Number.isFinite(Date.parse(publishedAt))
  )
    throw new UpdateFailure("integrity");
  let artifact: AppRelease["artifact"] = null,
    storeUrl: string | null = null;
  if (item.channel === "direct" && item.platform === "android") {
    const file = record(item.artifact);
    const sha256 = text(file.sha256, 64);
    if (
      !/^[a-f0-9]{64}$/.test(sha256) ||
      file.path !== `/api/app-updates/artifacts/${sha256}.apk` ||
      item.storeUrl !== null
    )
      throw new UpdateFailure("integrity");
    artifact = { path: file.path, sha256, size: integer(file.size) };
  } else {
    if (
      item.artifact !== null ||
      !["store", "testflight"].includes(String(item.channel))
    )
      throw new UpdateFailure("integrity");
    storeUrl = text(item.storeUrl, 2048);
    let url: URL;
    try {
      url = new URL(storeUrl);
    } catch {
      throw new UpdateFailure("integrity");
    }
    const host =
      item.platform === "android"
        ? "play.google.com"
        : item.channel === "testflight"
          ? "testflight.apple.com"
          : "apps.apple.com";
    if (
      url.protocol !== "https:" ||
      url.hostname !== host ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      (item.platform === "android" &&
        (item.channel !== "store" ||
          url.pathname !== "/store/apps/details" ||
          url.searchParams.get("id") !== installed.appId)) ||
      (item.platform === "ios" &&
        !(
          item.channel === "testflight"
            ? /^\/join\/[A-Za-z0-9]+$/
            : /^\/(?:[a-z]{2}\/)?app\/(?:[^/]+\/)?id\d+$/
        ).test(url.pathname))
    )
      throw new UpdateFailure("integrity");
  }
  return {
    id: text(item.id, 100),
    platform: item.platform as AppRelease["platform"],
    channel: item.channel as AppRelease["channel"],
    appId: installed.appId,
    version,
    buildNumber,
    minSupportedBuild,
    importance: item.importance,
    notesZh: text(item.notesZh, 10000),
    notesEn: text(item.notesEn, 10000),
    publishedAt,
    artifact,
    storeUrl,
  };
}
export function emptyUpdatePreferences(): UpdatePreferences {
  return {
    lastCheckedAt: null,
    lastPromptedAt: null,
    deferredUntil: null,
    skippedBuild: null,
    release: null,
  };
}
export function parseUpdatePreferences(
  value: unknown,
  installed: InstalledApp,
): UpdatePreferences {
  try {
    const raw = record(value),
      result = emptyUpdatePreferences();
    for (const key of [
      "lastCheckedAt",
      "lastPromptedAt",
      "deferredUntil",
      "skippedBuild",
    ] as const) {
      if (raw[key] !== null && raw[key] !== undefined)
        result[key] = integer(raw[key], 0);
    }
    if (raw.release !== null && raw.release !== undefined) {
      const item = parseAppRelease(raw.release, installed);
      if (item.buildNumber > installed.buildNumber) result.release = item;
    }
    return result;
  } catch {
    return emptyUpdatePreferences();
  }
}
export function shouldRemindUpdate(
  release: AppRelease,
  installed: InstalledApp,
  preferences: UpdatePreferences,
  now: number,
): boolean {
  if (
    release.buildNumber <= installed.buildNumber ||
    installed.platform === "web"
  )
    return false;
  if (preferences.deferredUntil !== null && now < preferences.deferredUntil)
    return false;
  if (
    preferences.lastPromptedAt !== null &&
    now - preferences.lastPromptedAt < day
  )
    return false;
  return (
    release.importance === "important" ||
    installed.buildNumber < release.minSupportedBuild ||
    preferences.skippedBuild !== release.buildNumber
  );
}
