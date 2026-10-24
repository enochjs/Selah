import { NativeModule, requireNativeModule } from "expo";
import { PermissionsAndroid, Platform } from "react-native";
import type { DownloadBackgroundPort } from "./download-background";

declare class BackgroundDownloadsModule extends NativeModule<{
  onPause: () => void;
}> {
  update(
    completed: number,
    total: number,
    percent: number,
    waiting: boolean,
  ): void;
  stop(): void;
}
const native = requireNativeModule<BackgroundDownloadsModule>(
  "SelahBackgroundDownloads",
);
export const downloadBackgroundPort: DownloadBackgroundPort = {
  update: ({ completed, total, percent, waiting }) =>
    native.update(completed, total, percent, waiting),
  stop: () => native.stop(),
};
export async function prepareBackgroundDownloads(): Promise<void> {
  if (Number(Platform.Version) < 33) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (!(await PermissionsAndroid.check(permission)))
    await PermissionsAndroid.request(permission);
}
export function onBackgroundDownloadPause(pause: () => void): void {
  native.addListener("onPause", pause);
}
