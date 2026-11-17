import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { runInNewContext } from "node:vm";

interface ElementState {
  hidden: boolean;
  disabled: boolean;
  textContent: string;
  href?: string;
  focused: boolean;
  focus(): void;
  scrollIntoView(): void;
  events: Record<string, () => void | Promise<void>>;
  addEventListener(event: string, callback: () => void): void;
  removeAttribute(name: string): void;
}
const apk = {
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "1.1.0",
  buildNumber: 2,
  publishedAt: "2026-11-16T01:00:00Z",
  notesZh: "体验版更新\n<script>alert(1)</script>",
  artifact: {
    path: `/api/app-updates/artifacts/${"a".repeat(64)}.apk`,
    size: 50000000,
    sha256: "a".repeat(64),
  },
};
async function page(
  release: unknown,
  failed = false,
  userAgent = "Mozilla/5.0 (Linux; Android 16) Chrome/150.0 Mobile Safari/537.36",
  clipboardAvailable = true,
) {
  const elements = new Map<string, ElementState>();
  const element = (id: string) => {
    if (!elements.has(id))
      elements.set(id, {
        hidden: true,
        disabled: false,
        textContent: "",
        focused: false,
        focus() {
          this.focused = true;
        },
        scrollIntoView() {},
        events: {},
        addEventListener(event, callback) {
          this.events[event] = callback;
        },
        removeAttribute(name) {
          if (name === "href") delete this.href;
        },
      });
    return elements.get(id)!;
  };
  let copied = "",
    requests = 0;
  const source = await readFile(
    path.resolve(__dirname, "../public/website/site.js"),
    "utf8",
  );
  runInNewContext(source, {
    document: { getElementById: element, addEventListener() {} },
    navigator: {
      userAgent,
      clipboard: {
        writeText: async (value: string) => {
          if (!clipboardAvailable) throw new Error("Clipboard denied");
          copied = value;
        },
      },
    },
    URL,
    URLSearchParams,
    Intl,
    AbortController,
    AbortSignal: {},
    setTimeout,
    clearTimeout,
    fetch: async (url: string) => {
      requests++;
      if (failed) throw new Error("Offline");
      return {
        ok: true,
        json: async () => ({
          release: url.includes("platform=android") ? release : null,
        }),
      };
    },
  });
  await new Promise(setImmediate);
  return { element, copied: () => copied, requests: () => requests };
}

it("loads a real APK action without requiring newer AbortSignal.timeout browsers", async () => {
  const view = await page(apk);
  expect(view.requests()).toBe(3);
  expect(view.element("android-download").hidden).toBe(false);
  expect(view.element("android-download").href).toBe(apk.artifact.path);
  expect(view.element("release-status").textContent).toContain("v1.1.0");
  expect(view.element("release-notes").textContent).toBe(apk.notesZh);
  expect(view.element("ios-status").textContent).toBe("尚未开放下载");
  expect(view.element("browser-tip").hidden).toBe(true);
  await view.element("copy-link").events.click();
  expect(view.copied()).toBe("https://www.enochjs.top/#download");
});
it("gives Android WeChat and QQ users a working browser guide instead of a blocked APK navigation", async () => {
  for (const userAgent of [
    "Android 16 MicroMessenger/8.0.80",
    "Android 16 QQ/9.0",
  ]) {
    const view = await page(apk, false, userAgent);
    expect(view.element("android-download").hidden).toBe(true);
    expect(view.element("android-download").href).toBeUndefined();
    expect(view.element("browser-download").hidden).toBe(false);
    expect(view.element("browser-tip").hidden).toBe(false);
    await view.element("browser-download").events.click();
    expect(view.copied()).toBe("https://www.enochjs.top/#download");
    expect(view.element("browser-copy-status").textContent).toContain("已复制");
    expect(view.element("browser-tip").focused).toBe(true);
    expect(view.requests()).toBe(3);
  }
});
it("shows a manual copy fallback when an embedded browser denies clipboard access", async () => {
  const view = await page(
    apk,
    false,
    "Android 16 MicroMessenger/8.0.80",
    false,
  );
  await view.element("browser-download").events.click();
  expect(view.element("browser-copy-status").textContent).toContain(
    "https://www.enochjs.top/#download",
  );
  expect(view.element("browser-tip").focused).toBe(true);
});
it("distinguishes no published package from network failure and keeps a retry action", async () => {
  const empty = await page(null);
  expect(empty.element("android-download").hidden).toBe(true);
  expect(empty.element("release-status").textContent).toContain("暂未开放");
  expect(empty.element("retry-release").hidden).toBe(false);
  const offline = await page(null, true);
  expect(offline.element("android-download").hidden).toBe(true);
  expect(offline.element("release-status").textContent).toContain("检查网络");
  expect(offline.element("retry-release").hidden).toBe(false);
  await offline.element("retry-release").events.click();
  expect(offline.requests()).toBe(6);
});
it("never exposes forged APK URLs, invalid packages or invalid release identities", async () => {
  for (const release of [
    {
      ...apk,
      artifact: { ...apk.artifact, path: "https://evil.example/selah.apk" },
    },
    { ...apk, artifact: { ...apk.artifact, size: 0 } },
    { ...apk, artifact: { ...apk.artifact, sha256: "b".repeat(64) } },
    { ...apk, appId: "another.app" },
  ]) {
    const view = await page(release);
    expect(view.element("android-download").hidden).toBe(true);
    expect(view.element("android-download").href).toBeUndefined();
  }
});
