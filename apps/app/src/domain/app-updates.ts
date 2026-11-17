export type UpdatePlatform = "android" | "ios";
export type UpdateChannel = "direct" | "store" | "testflight";
export interface UpdateArtifact {
  path: string;
  size: number;
  sha256: string;
}
export interface AppRelease {
  id: string;
  platform: UpdatePlatform;
  channel: UpdateChannel;
  appId: string;
  version: string;
  buildNumber: number;
  minSupportedBuild: number;
  importance: "normal" | "important";
  notesZh: string;
  notesEn: string;
  publishedAt: string;
  artifact: UpdateArtifact | null;
  storeUrl: string | null;
}
export interface InstalledApp {
  platform: UpdatePlatform | "web";
  channel: UpdateChannel;
  appId: string;
  version: string;
  buildNumber: number;
}
export type UpdateFailureCode =
  | "network"
  | "storage"
  | "integrity"
  | "incompatible"
  | "permission"
  | "unsupported"
  | "unavailable"
  | "cancelled";
export class UpdateFailure extends Error {
  constructor(public readonly code: UpdateFailureCode) {
    super(code);
    this.name = "UpdateFailure";
  }
}
export interface UpdateArtifactPort {
  installed(): InstalledApp;
  recover(release: AppRelease): Promise<boolean>;
  download(
    release: AppRelease,
    signal: AbortSignal,
    progress: (bytes: number) => void,
  ): Promise<void>;
  install(release: AppRelease): Promise<"opened" | "permission">;
  openPermissionSettings(): Promise<void>;
}
export interface UpdatePreferences {
  lastCheckedAt: number | null;
  lastPromptedAt: number | null;
  deferredUntil: number | null;
  skippedBuild: number | null;
  release: AppRelease | null;
}
export type UpdatePhase =
  | "idle"
  | "current"
  | "available"
  | "downloading"
  | "paused"
  | "verifying"
  | "ready"
  | "installing"
  | "permission"
  | "error";
export interface UpdateSnapshot {
  initialized: boolean;
  installed: InstalledApp;
  phase: UpdatePhase;
  release: AppRelease | null;
  bytes: number;
  error: UpdateFailureCode | null;
  checking: boolean;
  checkFailed: boolean;
}
export interface UpdatePorts {
  artifact: UpdateArtifactPort;
  check(installed: InstalledApp): Promise<AppRelease | null>;
  load(): Promise<UpdatePreferences>;
  save(preferences: UpdatePreferences): Promise<void>;
  now(): number;
}
export {
  parseAppRelease,
  emptyUpdatePreferences,
  parseUpdatePreferences,
  shouldRemindUpdate,
} from "./app-release";
export { AppUpdateManager } from "./app-update-manager";
