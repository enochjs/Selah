import type { ElementRef, RefObject } from "react";
import type { View } from "react-native";
import { captureRef, releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import type {
  DailyVerseSharePayload,
  ShareImageFormat,
} from "../../domain/daily-verse-sharing";
export interface PreparedShareImage {
  uri: string;
  share: () => Promise<void>;
  save?: () => void;
  dispose: () => void;
}
export async function prepareShareImage(
  _payload: DailyVerseSharePayload,
  format: ShareImageFormat,
  ref: RefObject<ElementRef<typeof View> | null>,
): Promise<PreparedShareImage> {
  if (!(await Sharing.isAvailableAsync()))
    throw new Error(
      "此设备暂不支持图片分享 / Image sharing is unavailable on this device",
    );
  const uri = await captureRef(ref, {
    format: "png",
    quality: 1,
    result: "tmpfile",
    width: 1080,
    height: format === "square" ? 1080 : 1920,
  });
  let active = false;
  let disposed = false;
  return {
    uri,
    async share() {
      if (active || disposed) return;
      active = true;
      try {
        await Sharing.shareAsync(uri, {
          mimeType: "image/png",
          UTI: "public.png",
          dialogTitle: "Selah · 每日经文",
        });
      } finally {
        active = false;
        if (disposed) releaseCapture(uri);
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (!active) releaseCapture(uri);
    },
  };
}
