import { beforeEach, expect, it, vi } from "vitest";
vi.mock("expo-linking", () => ({ openURL: vi.fn() }));
const state = vi.hoisted(() => ({
  listener: undefined as
    undefined | ((event: { sha256: string; bytes: number }) => void),
  download: vi.fn(),
  cancel: vi.fn(),
  recover: vi.fn(),
  install: vi.fn(),
  removed: vi.fn(),
}));
vi.mock("expo", () => ({
  requireNativeModule: () => ({
    installed: () => ({
      platform: "android",
      channel: "direct",
      appId: "app.selah.bible",
      version: "1.2",
      buildNumber: 12,
    }),
    download: state.download,
    cancel: state.cancel,
    recover: state.recover,
    install: state.install,
    openPermissionSettings: vi.fn(),
    addListener: (_: string, fn: typeof state.listener) => {
      state.listener = fn;
      return { remove: state.removed };
    },
  }),
}));
vi.mock("../src/config/resources", () => ({
  resourceServerUrl: () => "https://audio.example.com",
}));
import { createUpdateArtifactPort } from "../src/data/update-artifact.android";
const release = {
  id: "r",
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "2",
  buildNumber: 13,
  minSupportedBuild: 1,
  importance: "normal",
  notesZh: "",
  notesEn: "",
  publishedAt: "2026-01-01T00:00:00Z",
  storeUrl: null,
  artifact: {
    path: "/api/app-updates/artifacts/" + "a".repeat(64) + ".apk",
    size: 100,
    sha256: "a".repeat(64),
  },
} as const;
beforeEach(() => {
  vi.clearAllMocks();
  state.listener = undefined;
});
it("uses installed native package identity", () => {
  expect(createUpdateArtifactPort().installed().buildNumber).toBe(12);
});
it("rejects a substituted artifact path before native I/O", async () => {
  await expect(
    createUpdateArtifactPort().recover({
      ...release,
      artifact: { ...release.artifact, path: "/foreign.apk" },
    }),
  ).rejects.toMatchObject({ code: "integrity" });
  expect(state.recover).not.toHaveBeenCalled();
});
it("filters progress and cancels native transfer while preserving its partial file", async () => {
  state.download.mockImplementation(async () => {
    state.listener?.({ sha256: "b".repeat(64), bytes: 10 });
    state.listener?.({ sha256: "a".repeat(64), bytes: 50 });
  });
  const controller = new AbortController();
  const progress = vi.fn();
  await createUpdateArtifactPort().download(
    release,
    controller.signal,
    progress,
  );
  expect(progress.mock.calls).toEqual([[50]]);
  expect(state.removed).toHaveBeenCalled();
  controller.abort();
  expect(state.cancel).not.toHaveBeenCalled();
});
it("aborted transfers never start", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(
    createUpdateArtifactPort().download(release, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ code: "cancelled" });
  expect(state.download).not.toHaveBeenCalled();
});
it("maps native verification failures to stable domain failures", async () => {
  state.install.mockRejectedValue(new Error("integrity: signature mismatch"));
  await expect(
    createUpdateArtifactPort().install(release),
  ).rejects.toMatchObject({ code: "integrity" });
});

import { officialStoreUrl } from "../src/data/update-artifact-store";
it("limits store routes to official HTTPS destinations with the matching channel", () => {
  expect(
    officialStoreUrl({
      ...release,
      platform: "ios",
      channel: "store",
      artifact: null,
      storeUrl: "https://apps.apple.com/app/id123",
    }),
  ).toBe("https://apps.apple.com/app/id123");
  expect(() =>
    officialStoreUrl({
      ...release,
      channel: "store",
      artifact: null,
      storeUrl:
        "https://play.google.com.attacker.com/store/apps/details?id=app.selah.bible",
    }),
  ).toThrow();
  expect(() =>
    officialStoreUrl({
      ...release,
      channel: "store",
      artifact: null,
      storeUrl: "https://play.google.com/store/apps/details?id=other.app",
    }),
  ).toThrow();
});

it("uses an attempt identity for cancellation so a late abort cannot cancel a later retry", async () => {
  const controller = new AbortController();
  state.download.mockImplementation(async (spec: { requestId: string }) => {
    controller.abort();
    expect(state.cancel).toHaveBeenLastCalledWith(spec.requestId);
  });
  await expect(
    createUpdateArtifactPort().download(release, controller.signal, vi.fn()),
  ).rejects.toMatchObject({ code: "cancelled" });
  const first = state.download.mock.calls[0][0].requestId;
  state.download.mockResolvedValue(undefined);
  await createUpdateArtifactPort().download(
    release,
    new AbortController().signal,
    vi.fn(),
  );
  expect(state.download.mock.calls[1][0].requestId).not.toBe(first);
});
