import type {
  AppRelease,
  InstalledApp,
  UpdateArtifactPort,
} from "../domain/app-updates";
import { UpdateFailure } from "../domain/app-updates";
export interface UpdateNativeBridge {
  installed(): InstalledApp;
  recover(spec: Record<string, string | number>): Promise<boolean>;
  download(spec: Record<string, string | number>): Promise<void>;
  cancel(requestId: string): void;
  install(
    spec: Record<string, string | number>,
  ): Promise<"opened" | "permission">;
  openPermissionSettings(): Promise<void>;
  addListener(
    name: "onProgress",
    listener: (event: { sha256: string; bytes: number }) => void,
  ): { remove(): void };
}
let transferSequence = 0;
const codes = [
  "network",
  "storage",
  "integrity",
  "incompatible",
  "permission",
  "unsupported",
  "unavailable",
  "cancelled",
] as const;
function failure(error: unknown): never {
  if (error instanceof UpdateFailure) throw error;
  const message = error instanceof Error ? error.message : String(error);
  const code =
    codes.find((candidate) => message.includes(candidate + ":")) ??
    "unavailable";
  throw new UpdateFailure(code);
}
export function bridgeArtifactPort(
  native: UpdateNativeBridge,
  origin: () => string | null,
): UpdateArtifactPort {
  function spec(release: AppRelease): Record<string, string | number> {
    const artifact = release.artifact;
    if (
      release.platform !== "android" ||
      release.channel !== "direct" ||
      !artifact
    )
      throw new UpdateFailure("unsupported");
    if (
      !/^[a-f0-9]{64}$/.test(artifact.sha256) ||
      artifact.path !== `/api/app-updates/artifacts/${artifact.sha256}.apk` ||
      !Number.isSafeInteger(artifact.size) ||
      artifact.size <= 0
    )
      throw new UpdateFailure("integrity");
    const base = origin();
    if (!base || new URL(base).protocol !== "https:")
      throw new UpdateFailure("unavailable");
    return {
      sha256: artifact.sha256,
      size: artifact.size,
      url: new URL(artifact.path, base).toString(),
      appId: release.appId,
      version: release.version,
      buildNumber: release.buildNumber,
    };
  }
  return {
    installed: () => native.installed(),
    async recover(release) {
      try {
        return await native.recover(spec(release));
      } catch (error) {
        return failure(error);
      }
    },
    async download(release, signal, progress) {
      const data: Record<string, string | number> & { requestId: string } = {
        ...spec(release),
        requestId: `${Date.now()}-${++transferSequence}`,
      };
      if (signal.aborted) throw new UpdateFailure("cancelled");
      const sha256 = String(data.sha256);
      const listener = native.addListener("onProgress", (event) => {
        if (event.sha256 === sha256) progress(event.bytes);
      });
      const abort = () => native.cancel(data.requestId);
      signal.addEventListener("abort", abort, { once: true });
      try {
        await native.download(data);
        if (signal.aborted) throw new UpdateFailure("cancelled");
      } catch (error) {
        failure(error);
      } finally {
        signal.removeEventListener("abort", abort);
        listener.remove();
      }
    },
    async install(release) {
      try {
        return await native.install(spec(release));
      } catch (error) {
        return failure(error);
      }
    },
    async openPermissionSettings() {
      try {
        await native.openPermissionSettings();
      } catch (error) {
        failure(error);
      }
    },
  };
}
