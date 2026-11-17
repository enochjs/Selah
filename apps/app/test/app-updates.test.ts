import { describe, expect, it, vi } from "vitest";
import {
  AppUpdateManager,
  UpdateFailure,
  emptyUpdatePreferences,
  parseAppRelease,
  shouldRemindUpdate,
  type AppRelease,
  type InstalledApp,
  type UpdateArtifactPort,
  type UpdatePreferences,
} from "../src/domain/app-updates";

const installed: InstalledApp = {
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "1.0.0",
  buildNumber: 1,
};
function release(change: Partial<AppRelease> = {}): AppRelease {
  return {
    id: "android-2",
    platform: "android",
    channel: "direct",
    appId: installed.appId,
    version: "1.1.0",
    buildNumber: 2,
    minSupportedBuild: 1,
    importance: "normal",
    notesZh: "改善阅读体验",
    notesEn: "Improve reading",
    publishedAt: "2026-11-16T00:00:00.000Z",
    artifact: {
      path: `/api/app-updates/artifacts/${"a".repeat(64)}.apk`,
      size: 100,
      sha256: "a".repeat(64),
    },
    storeUrl: null,
    ...change,
  };
}
function fixture() {
  let now = Date.parse("2026-11-16T00:00:00Z");
  let saved: UpdatePreferences = emptyUpdatePreferences();
  const check = vi.fn(async () => release() as AppRelease | null);
  const artifact: UpdateArtifactPort = {
    installed: () => installed,
    recover: vi.fn(async () => false),
    download: vi.fn(async (_release, _signal, progress) => {
      progress(50);
      progress(100);
    }),
    install: vi.fn(async () => "opened" as const),
    openPermissionSettings: vi.fn(async () => {}),
  };
  const manager = new AppUpdateManager({
    artifact,
    check,
    load: async () => saved,
    save: async (value) => {
      saved = structuredClone(value);
    },
    now: () => now,
  });
  return {
    manager,
    check,
    artifact,
    saved: () => saved,
    advance: (ms: number) => {
      now += ms;
    },
  };
}
describe("release contract", () => {
  it("validates signed-package metadata and exact platform/channel/app identity", () => {
    expect(parseAppRelease(release(), installed)).toEqual(release());
    for (const change of [
      {
        artifact: {
          ...release().artifact!,
          path: "https://evil.example/app.apk",
        },
      },
      { artifact: { ...release().artifact!, size: -1 } },
      { artifact: { ...release().artifact!, sha256: "bad" } },
      { appId: "other.app" },
      { buildNumber: 2.1 },
      { minSupportedBuild: 3 },
      { platform: "ios" },
      { channel: "store" },
      { version: "bad" },
      { publishedAt: "yesterday" },
      { importance: "forced" },
      { notesZh: "" },
      {
        artifact: {
          ...release().artifact!,
          path: `/api/app-updates/artifacts/${"b".repeat(64)}.apk`,
        },
      },
    ])
      expect(() =>
        parseAppRelease({ ...release(), ...change }, installed),
      ).toThrow();
  });
  it("allows only official store links for the installed store channel", () => {
    const ios: InstalledApp = {
      ...installed,
      platform: "ios",
      channel: "store",
    };
    expect(
      parseAppRelease(
        release({
          platform: "ios",
          channel: "store",
          artifact: null,
          storeUrl: "https://apps.apple.com/app/id123456",
        }),
        ios,
      ).storeUrl,
    ).toContain("apps.apple.com");
    for (const url of [
      "javascript:alert(1)",
      "https://apps.apple.com.evil.example/a",
      "https://apps.apple.com@evil.example/a",
      "https://evil.example/app",
    ]) {
      expect(() =>
        parseAppRelease(
          release({
            platform: "ios",
            channel: "store",
            artifact: null,
            storeUrl: url,
          }),
          ios,
        ),
      ).toThrow();
    }
  });
});
describe("update flow", () => {
  it("checks at most once per day automatically while manual checking always works", async () => {
    const f = fixture();
    await f.manager.check(false);
    await f.manager.check(false);
    expect(f.check).toHaveBeenCalledTimes(1);
    await f.manager.check(true);
    expect(f.check).toHaveBeenCalledTimes(2);
    f.advance(86_400_000);
    await f.manager.check(false);
    expect(f.check).toHaveBeenCalledTimes(3);
  });
  it("uses build numbers and prevents mismatched or downgraded metadata", async () => {
    const f = fixture();
    f.check.mockResolvedValue(release({ version: "9.0.0", buildNumber: 1 }));
    await f.manager.check();
    expect(f.manager.getSnapshot().phase).toBe("current");
    f.check.mockResolvedValue(release({ appId: "evil.app" }));
    await f.manager.check();
    expect(f.manager.getSnapshot().checkFailed).toBe(true);
    expect(f.manager.getSnapshot().release).toBeNull();
  });
  it("does not report latest after a failed request or retry every foreground event", async () => {
    const f = fixture();
    f.check.mockRejectedValue(new Error("offline"));
    await f.manager.check(false);
    await f.manager.check(false);
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: "idle",
      checkFailed: true,
      checking: false,
    });
    expect(f.check).toHaveBeenCalledTimes(1);
    await f.manager.check(true);
    expect(f.check).toHaveBeenCalledTimes(2);
  });
  it("coalesces competing checks and never interrupts an active transfer", async () => {
    const f = fixture();
    let finish!: (value: AppRelease) => void;
    f.check.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const first = f.manager.check();
    const second = f.manager.check();
    await vi.waitFor(() => expect(f.check).toHaveBeenCalledTimes(1));
    finish(release());
    await Promise.all([first, second]);
    let complete!: () => void;
    vi.mocked(f.artifact.download).mockImplementation(
      async (_item, _signal, progress) => {
        progress(10);
        await new Promise<void>((resolve) => {
          complete = resolve;
        });
      },
    );
    const transfer = f.manager.download();
    await vi.waitFor(() =>
      expect(f.manager.getSnapshot().phase).toBe("downloading"),
    );
    await f.manager.check();
    expect(f.check).toHaveBeenCalledTimes(1);
    complete();
    await transfer;
  });
  it("exposes verified readiness and requires an explicit installation action", async () => {
    const f = fixture();
    await f.manager.check();
    await f.manager.download();
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: "ready",
      bytes: 100,
      error: null,
    });
    expect(f.artifact.install).not.toHaveBeenCalled();
    await f.manager.install();
    expect(f.artifact.install).toHaveBeenCalledOnce();
    expect(f.manager.getSnapshot().phase).toBe("ready");
  });
  it("pauses without losing the release and resumes after cancellation", async () => {
    const f = fixture();
    await f.manager.check();
    vi.mocked(f.artifact.download).mockImplementationOnce(
      async (_item, signal, progress) => {
        progress(40);
        await new Promise<void>((_resolve, reject) =>
          signal.addEventListener("abort", () =>
            reject(new UpdateFailure("cancelled")),
          ),
        );
      },
    );
    const transfer = f.manager.download();
    await vi.waitFor(() => expect(f.manager.getSnapshot().bytes).toBe(40));
    f.manager.pause();
    await transfer;
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: "paused",
      bytes: 40,
    });
    await f.manager.download();
    expect(f.manager.getSnapshot().phase).toBe("ready");
  });
  it("shows integrity errors and prevents installation of an unverified package", async () => {
    const f = fixture();
    await f.manager.check();
    vi.mocked(f.artifact.download).mockRejectedValue(
      new UpdateFailure("integrity"),
    );
    await f.manager.download();
    await f.manager.install();
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: "error",
      error: "integrity",
    });
    expect(f.artifact.install).not.toHaveBeenCalled();
  });
  it("keeps a checked package when system installation is cancelled or permission is needed", async () => {
    const f = fixture();
    await f.manager.check();
    await f.manager.download();
    vi.mocked(f.artifact.install).mockResolvedValueOnce("permission");
    await f.manager.install();
    expect(f.manager.getSnapshot().phase).toBe("permission");
    await f.manager.openPermissionSettings();
    expect(f.artifact.openPermissionSettings).toHaveBeenCalledOnce();
    await f.manager.install();
    expect(f.manager.getSnapshot().phase).toBe("ready");
  });
  it("restores release preferences and re-verifies a cached artifact after restart", async () => {
    const f = fixture();
    await f.manager.check();
    await f.manager.skip();
    const next = new AppUpdateManager({
      artifact: { ...f.artifact, recover: async () => true },
      check: f.check,
      load: async () => f.saved(),
      save: async () => {},
      now: () => Date.parse("2026-11-16T00:00:00Z"),
    });
    await next.initialize();
    expect(next.getSnapshot()).toMatchObject({
      phase: "ready",
      release: { buildNumber: 2 },
    });
    expect(next.canRemind()).toBe(false);
  });
  it("withdraws a cached release when the next successful check has no eligible update", async () => {
    const f = fixture();
    await f.manager.check();
    await f.manager.download();
    f.check.mockResolvedValue(null);
    await f.manager.check();
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: "current",
      release: null,
    });
    expect(f.saved().release).toBeNull();
  });
  it("retains cached compatibility restrictions even when the artifact cache cannot be read", async () => {
    const f = fixture();
    const cached = {
      ...emptyUpdatePreferences(),
      release: release({ minSupportedBuild: 2 }),
    };
    const next = new AppUpdateManager({
      artifact: {
        ...f.artifact,
        recover: async () => {
          throw new UpdateFailure("storage");
        },
      },
      check: f.check,
      load: async () => cached,
      save: async () => {},
      now: Date.now,
    });
    await next.initialize();
    expect(next.getSnapshot()).toMatchObject({
      initialized: true,
      release: { minSupportedBuild: 2 },
      error: "storage",
    });
  });
  it("applies fresh minimum-supported metadata even when local artifact recovery fails", async () => {
    const f = fixture();
    f.check.mockResolvedValue(release({ minSupportedBuild: 2 }));
    vi.mocked(f.artifact.recover).mockRejectedValue(
      new UpdateFailure("storage"),
    );
    await f.manager.check();
    expect(f.manager.getSnapshot()).toMatchObject({
      release: { minSupportedBuild: 2 },
      error: "storage",
      checkFailed: false,
      checking: false,
    });
    expect(f.saved().release?.minSupportedBuild).toBe(2);
  });
});
describe("reminder policy", () => {
  it("skips normal releases but never treats an important or incompatible build as skipped", () => {
    const prefs = { ...emptyUpdatePreferences(), skippedBuild: 2 };
    const now = Date.parse("2026-11-16T00:00:00Z");
    expect(shouldRemindUpdate(release(), installed, prefs, now)).toBe(false);
    expect(
      shouldRemindUpdate(
        release({ importance: "important" }),
        installed,
        prefs,
        now,
      ),
    ).toBe(true);
    expect(
      shouldRemindUpdate(
        release({ minSupportedBuild: 2 }),
        installed,
        prefs,
        now,
      ),
    ).toBe(true);
  });
  it("limits actual reminders daily and honors later without blocking offline reading", async () => {
    const f = fixture();
    await f.manager.check();
    expect(f.manager.canRemind()).toBe(true);
    await f.manager.markReminded();
    expect(f.manager.canRemind()).toBe(false);
    f.advance(86_400_000);
    expect(f.manager.canRemind()).toBe(true);
    await f.manager.defer();
    expect(f.manager.canRemind()).toBe(false);
  });
});
