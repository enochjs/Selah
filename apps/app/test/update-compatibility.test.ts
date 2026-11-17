import { afterEach, expect, it, vi } from "vitest";
import {
  AppUpdateManager,
  emptyUpdatePreferences,
  type AppRelease,
  type InstalledApp,
} from "../src/domain/app-updates";
import {
  bindUpdateCompatibility,
  compatibilityRequired,
  assertOnlineCompatible,
  compatibleFetch,
  resolveCompatibleAudioSource,
} from "../src/data/update-compatibility";
const installed: InstalledApp = {
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "1.0.0",
  buildNumber: 2,
};
const release: AppRelease = {
  id: "required-5",
  platform: "android",
  channel: "direct",
  appId: installed.appId,
  version: "1.1.0",
  buildNumber: 5,
  minSupportedBuild: 3,
  importance: "normal",
  notesZh: "服务协议升级",
  notesEn: "API compatibility update",
  publishedAt: "2026-11-16T00:00:00.000Z",
  artifact: {
    path: `/api/app-updates/artifacts/${"a".repeat(64)}.apk`,
    sha256: "a".repeat(64),
    size: 10,
  },
  storeUrl: null,
};
let dispose = () => {};
afterEach(() => {
  dispose();
  vi.unstubAllGlobals();
});
function manager(saved: AppRelease | null = release, buildNumber = 2) {
  const check = vi.fn(async () => null as AppRelease | null);
  const value = new AppUpdateManager({
    artifact: {
      installed: () => ({ ...installed, buildNumber }),
      recover: async () => false,
      download: async () => {},
      install: async () => "opened",
      openPermissionSettings: async () => {},
    },
    load: async () => ({ ...emptyUpdatePreferences(), release: saved }),
    save: async () => {},
    check,
    now: Date.now,
  });
  dispose = bindUpdateCompatibility(value);
  return { value, check };
}
it.each([
  [2, true],
  [3, false],
  [5, false],
  [6, false],
])(
  "uses installed build %s and support floor, independently of ordinary importance",
  async (build, required) => {
    const { value } = manager(release, build);
    await value.initialize();
    expect(compatibilityRequired()).toBe(required);
    if (required) expect(assertOnlineCompatible).toThrow(/Update required/);
    else expect(assertOnlineCompatible).not.toThrow();
  },
);
it("restores the cached gate before any new online fetch, and lifts it after withdrawal", async () => {
  const fetcher = vi.fn(async () => new Response("ok"));
  vi.stubGlobal("fetch", fetcher);
  const { value } = manager();
  await expect(
    compatibleFetch("https://content.example/hymns"),
  ).rejects.toMatchObject({ code: "update-required" });
  expect(fetcher).not.toHaveBeenCalled();
  await value.check();
  expect(compatibilityRequired()).toBe(false);
  await compatibleFetch("https://content.example/hymns");
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("resolves completed cached audio before rejecting a new remote fallback without altering canonical URLs", async () => {
  const { value } = manager();
  await value.initialize();
  const remote = { uri: "https://content.example/chapter.mp3" };
  const cache = vi.fn(async () => ({ uri: "file:///documents/chapter.mp3" }));
  expect(await resolveCompatibleAudioSource(remote, cache)).toEqual({
    uri: "file:///documents/chapter.mp3",
  });
  expect(cache).toHaveBeenCalledWith(remote);
  expect(remote.uri).toBe("https://content.example/chapter.mp3");
  await expect(
    resolveCompatibleAudioSource(remote, async (source) => source),
  ).rejects.toMatchObject({ code: "update-required" });
  expect(await resolveCompatibleAudioSource(42, async (source) => source)).toBe(
    42,
  );
  expect(
    await resolveCompatibleAudioSource(
      { uri: "blob:cached" },
      async (source) => source,
    ),
  ).toEqual({ uri: "blob:cached" });
});
it("does not abort a request already started when the minimum-build gate becomes known", async () => {
  let complete!: (value: Response) => void;
  const fetcher = vi.fn(
    () =>
      new Promise<Response>((resolve) => {
        complete = resolve;
      }),
  );
  vi.stubGlobal("fetch", fetcher);
  const { value, check } = manager(null);
  await value.initialize();
  const pending = compatibleFetch("https://content.example/already-started");
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  check.mockResolvedValue(release);
  await value.check();
  expect(compatibilityRequired()).toBe(true);
  complete(new Response("done"));
  expect(await (await pending).text()).toBe("done");
});
it("retains synthesized pronunciation when a new remote recording is incompatible", async () => {
  const { WordPronunciation } =
    await import("../src/domain/word-pronunciation");
  const { value } = manager();
  await value.initialize();
  const play = vi.fn(),
    speak = vi.fn(async () => {});
  const pronunciation = new WordPronunciation({
    stop: async () => {},
    playAudio: async (url) => {
      await resolveCompatibleAudioSource(
        { uri: url },
        async (source) => source,
      );
      play();
    },
    speak,
  });
  await pronunciation.play(
    "peace",
    "https://dictionary.example/peace.mp3",
    () => {},
  );
  expect(play).not.toHaveBeenCalled();
  expect(speak).toHaveBeenCalledWith("peace");
});
