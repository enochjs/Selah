export interface UpdateArtifact {
  path: string;
  size: number;
  sha256: string;
}
export interface AppRelease {
  id: string;
  platform: "android" | "ios";
  channel: "direct" | "store" | "testflight";
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
export interface AdminRelease extends AppRelease {
  enabled: boolean;
}
export interface AppUpdateCatalog {
  revision: number;
  items: AdminRelease[];
}
