import type { InstalledApp, AppRelease } from "../domain/app-updates";
import type { AudioTrack } from "../domain/models";

const message =
  "请先更新 App 后使用在线服务；已下载内容仍可使用。 / Update required for online services. Downloaded content remains available.";
export class OnlineCompatibilityError extends Error {
  readonly code = "update-required";
  constructor() {
    super(message);
    this.name = "OnlineCompatibilityError";
  }
}
type CompatibilitySnapshot = {
  installed: Pick<InstalledApp, "buildNumber">;
  release: Pick<AppRelease, "buildNumber" | "minSupportedBuild"> | null;
};
interface CompatibilitySource {
  getSnapshot(): CompatibilitySnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
}
let snapshot: CompatibilitySnapshot | null = null;
let initialize: (() => Promise<void>) | null = null;
let binding: object | null = null;
/** Bind state only. Gate changes never cancel requests, mutate URLs or control playback. */
export function bindUpdateCompatibility(source: CompatibilitySource) {
  const token = {};
  binding = token;
  snapshot = source.getSnapshot();
  initialize = () => source.initialize();
  const unsubscribe = source.subscribe(() => {
    if (binding === token) snapshot = source.getSnapshot();
  });
  return () => {
    unsubscribe();
    if (binding === token) {
      binding = null;
      snapshot = null;
      initialize = null;
    }
  };
}
export function compatibilityRequired() {
  const release = snapshot?.release,
    installed = snapshot?.installed;
  return Boolean(
    release &&
    installed &&
    release.buildNumber > installed.buildNumber &&
    installed.buildNumber < release.minSupportedBuild,
  );
}
export function assertOnlineCompatible() {
  if (compatibilityRequired()) throw new OnlineCompatibilityError();
}
/** Restore cached checks before starting new I/O, including at application startup. */
export async function ensureOnlineCompatible() {
  assertOnlineCompatible();
  await initialize?.();
  assertOnlineCompatible();
}
export async function compatibleFetch(
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) {
  await ensureOnlineCompatible();
  assertOnlineCompatible();
  return fetch(input, init);
}
/** Canonical remote keys must reach offline lookup unchanged before applying the gate. */
export async function resolveCompatibleAudioSource(
  source: AudioTrack["source"],
  resolve: (source: AudioTrack["source"]) => Promise<AudioTrack["source"]>,
) {
  const resolved = await resolve(source);
  if (typeof resolved !== "number" && /^(?:https?:)?\/\//i.test(resolved.uri))
    await ensureOnlineCompatible();
  return resolved;
}
