import type { DownloadBackgroundPort } from "./download-background";

// iOS uses the file system's background URLSession; Web has no foreground service.
export const downloadBackgroundPort: DownloadBackgroundPort = {
  update: () => {},
  stop: () => {},
};
export async function prepareBackgroundDownloads(): Promise<void> {}
export function onBackgroundDownloadPause(_pause: () => void): void {}
