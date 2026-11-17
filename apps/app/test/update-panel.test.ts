import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { UpdateSnapshot } from "../src/domain/app-updates";
vi.mock("../src/shared/theme", () => ({
  colors: { green: "#4C6244", muted: "#666D60", red: "#AC5A50" },
  fonts: { medium: "sans-serif" },
}));
vi.mock("lucide-react-native", () => ({
  ArrowDownToLine: () => null,
  Check: () => null,
  RefreshCw: () => null,
  ShieldCheck: () => null,
  Smartphone: () => null,
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ActivityIndicator: () => React.createElement("span", null, "loading"),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  Panel: ({ children }: PropsWithChildren) =>
    React.createElement("section", null, children),
  Button: ({ children, disabled }: PropsWithChildren<{ disabled: boolean }>) =>
    React.createElement("button", { disabled }, children),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
import { UpdatePanel } from "../src/features/updates/UpdatePanel";
const base: UpdateSnapshot = {
  installed: {
    platform: "android",
    channel: "direct",
    appId: "app.selah.bible",
    version: "1.0.0",
    buildNumber: 1,
  },
  initialized: true,
  phase: "idle",
  release: null,
  bytes: 0,
  error: null,
  checking: false,
  checkFailed: false,
};
function render(state: Partial<UpdateSnapshot>) {
  return renderToStaticMarkup(
    React.createElement(UpdatePanel, {
      state: { ...base, ...state },
      onCheck: () => {},
      onDownload: () => {},
      onPause: () => {},
      onInstall: () => {},
      onPermission: () => {},
    }),
  ).replace(/<[^>]*>/g, "");
}
it("distinguishes failed checks, checking and a confirmed latest version", () => {
  expect(render({ phase: "current" })).toContain("当前已是最新版本");
  expect(render({ checkFailed: true })).toContain("暂时无法检查更新");
  expect(render({ checkFailed: true })).not.toContain("当前已是最新版本");
  expect(render({ checking: true })).toContain("正在检查更新");
});
const release = {
  id: "next",
  platform: "android" as const,
  channel: "direct" as const,
  appId: "app.selah.bible",
  version: "1.1.0",
  buildNumber: 2,
  minSupportedBuild: 1,
  importance: "normal" as const,
  notesZh: "改善阅读体验\n修复播放问题",
  notesEn: "Improve reading",
  publishedAt: "2026-11-16T00:00:00Z",
  artifact: {
    path: `/api/app-updates/artifacts/${"a".repeat(64)}.apk`,
    size: 1024 * 1024 * 100,
    sha256: "a".repeat(64),
  },
  storeUrl: null,
};
it("offers explicit install only after verification, with visible download progress", () => {
  expect(
    render({ phase: "downloading", release, bytes: release.artifact.size / 2 }),
  ).toContain("50%");
  expect(
    render({ phase: "verifying", release, bytes: release.artifact.size }),
  ).toContain("正在校验安装包");
  expect(render({ phase: "verifying", release })).not.toContain("立即安装");
  expect(render({ phase: "ready", release })).toContain("立即安装");
  expect(render({ phase: "ready", release })).toContain("改善阅读体验");
});
it("offers recoverable actions for interrupted downloads and denied permission", () => {
  expect(render({ phase: "paused", release })).toContain("继续下载");
  expect(render({ phase: "error", error: "integrity", release })).toContain(
    "重新下载",
  );
  expect(render({ phase: "permission", release })).toContain("前往设置");
  expect(render({ phase: "permission", release })).toContain(
    "已开启，继续安装",
  );
});
