import { afterEach, expect, it, vi } from "vitest";
import { prepareShareImage } from "../src/features/daily-verse/share-image.web";
import type { DailyVerseSharePayload } from "../src/domain/daily-verse-sharing";
vi.mock("expo-asset", () => ({
  Asset: { fromModule: () => ({ uri: "/daily-verse-share.jpg" }) },
}));
vi.mock("../src/features/daily-verse/share-background", () => ({
  dailyVerseShareBackground: 1,
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
it("downloads directly even when native browser sharing is available and pending", async () => {
  vi.useFakeTimers();
  const click = vi.fn();
  const anchor = { href: "", download: "", click, remove: vi.fn() };
  const context = {
    measureText: (text: string) => ({ width: text.length * 10 }),
    drawImage: vi.fn(),
    createLinearGradient: () => ({ addColorStop: vi.fn() }),
    fillRect: vi.fn(),
    fillText: vi.fn(),
  };
  vi.stubGlobal("document", {
    fonts: { ready: Promise.resolve() },
    body: { appendChild: vi.fn() },
    createElement: (tag: string) =>
      tag === "a"
        ? anchor
        : {
            getContext: () => context,
            toBlob: (done: (blob: Blob) => void) => done(new Blob(["png"])),
          },
  });
  vi.stubGlobal(
    "Image",
    class {
      width = 100;
      height = 100;
      decode() {
        return Promise.resolve();
      }
    },
  );
  const fetchBackground = vi.fn(async () => ({
    ok: true,
    blob: async () => new Blob(["photo"]),
  }));
  vi.stubGlobal("fetch", fetchBackground);
  const revoke = vi.fn();
  vi.stubGlobal("URL", {
    createObjectURL: vi
      .fn()
      .mockReturnValueOnce("source")
      .mockReturnValueOnce("preview")
      .mockReturnValueOnce("download"),
    revokeObjectURL: revoke,
  });
  let finish!: () => void;
  const share = vi.fn(
    (_data: { files: File[] }) =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  vi.stubGlobal("navigator", { canShare: () => true, share });
  const payload = {
    date: "2026-11-02",
    primaryText: "完整经文",
    secondaryText: "Complete scripture",
    primaryLocale: "zh",
    reference: "诗篇1:1",
  } satisfies DailyVerseSharePayload;
  const prepared = await prepareShareImage(payload, "square", {
    current: null,
  });
  expect(fetchBackground).toHaveBeenCalledExactlyOnceWith(
    "/daily-verse-share.jpg",
  );
  expect(context.fillText.mock.calls.map(([text]) => text)).toEqual([
    "SELAH · 每日经文",
    "和合本",
    "完整经文",
    "NIV",
    "Complete scripture",
    "诗篇1:1",
    "2026-11-02 · Selah",
  ]);
  prepared.save?.();
  expect(click).toHaveBeenCalledOnce();
  expect(anchor.download).toBe("selah-2026-11-02-square.png");
  expect(anchor.href).toBe("download");
  expect(share).not.toHaveBeenCalled();
  const pending = prepared.share();
  prepared.dispose();
  expect(share.mock.calls[0][0].files[0].type).toBe("image/png");
  expect(revoke).toHaveBeenCalledWith("preview");
  expect(revoke).not.toHaveBeenCalledWith("download");
  finish();
  await pending;
  await vi.runAllTimersAsync();
  expect(revoke).toHaveBeenCalledWith("download");
});
