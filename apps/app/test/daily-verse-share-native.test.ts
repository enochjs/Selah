import { expect, it, vi } from "vitest";
vi.mock("react-native-view-shot", () => ({
  captureRef: vi.fn(async () => "file:///capture.png"),
  releaseCapture: vi.fn(),
}));
vi.mock("expo-sharing", () => ({
  isAvailableAsync: async () => true,
  shareAsync: vi.fn(),
}));
import { releaseCapture } from "react-native-view-shot";
import * as Sharing from "expo-sharing";
import { prepareShareImage } from "../src/features/daily-verse/share-image";
import type { DailyVerseSharePayload } from "../src/domain/daily-verse-sharing";
it("keeps an active native export file until the system operation finishes after invalidation", async () => {
  let finish!: () => void;
  vi.mocked(Sharing.shareAsync).mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const prepared = await prepareShareImage(
    {} as DailyVerseSharePayload,
    "square",
    { current: null },
  );
  const pending = prepared.share();
  prepared.dispose();
  expect(releaseCapture).not.toHaveBeenCalled();
  await prepared.share();
  expect(Sharing.shareAsync).toHaveBeenCalledOnce();
  finish();
  await pending;
  expect(releaseCapture).toHaveBeenCalledExactlyOnceWith("file:///capture.png");
  await prepared.share();
  expect(Sharing.shareAsync).toHaveBeenCalledOnce();
});
