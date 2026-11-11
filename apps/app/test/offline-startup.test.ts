import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { OfflineState } from "../src/domain/offline-audio";

const offline = vi.hoisted(() => ({
  state: {
    ready: false,
    chapters: {},
    assets: {},
    wifiOnly: true,
    transfers: {},
    network: "unknown",
  } as OfflineState,
}));
vi.mock("react-native", () => ({
  View: ({ children }: React.PropsWithChildren) =>
    React.createElement("div", null, children),
  ActivityIndicator: () => React.createElement("span", null, "checking"),
  AppState: {},
}));
vi.mock("expo-network", () => ({}));
vi.mock("../src/data/offline-audio-runtime", () => ({
  downloadManager: { getSnapshot: () => offline.state },
  subscribeDownloads: () => () => {},
  initializeDownloads: vi.fn(),
  prepareDownloads: vi.fn(),
  prepareHymnDownload: vi.fn(),
  enqueueDownloads: vi.fn(),
  resumeDownloads: vi.fn(),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/theme", () => ({ colors: {} }));
vi.mock("../src/shared/ui", () => ({
  Button: () => null,
  Txt: () => null,
}));
import {
  OfflineAudioProvider,
  useOfflineAudio,
} from "../src/features/downloads/OfflineAudioProvider";

function Home() {
  const { state } = useOfflineAudio();
  return React.createElement("main", null, `home:offline-ready=${state.ready}`);
}
beforeEach(() => {
  offline.state = { ...offline.state, ready: false };
});

it("renders the home screen while saved audio is still being checked", () => {
  const html = renderToStaticMarkup(
    React.createElement(OfflineAudioProvider, null, React.createElement(Home)),
  );
  expect(html).toContain("home:offline-ready=false");
});

it("exposes verified audio readiness to the same screen after initialization", () => {
  offline.state = { ...offline.state, ready: true };
  const html = renderToStaticMarkup(
    React.createElement(OfflineAudioProvider, null, React.createElement(Home)),
  );
  expect(html).toContain("home:offline-ready=true");
});
