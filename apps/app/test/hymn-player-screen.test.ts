import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";

const ui = vi.hoisted(() => ({
  track: { kind: "hymn" } as AudioTrack | null,
  section: null as "settings" | "queue" | null,
  hasHistory: true,
  back: vi.fn(),
  replace: vi.fn(),
  actions: [] as { label: string; press: () => void }[],
  request: undefined as undefined | ((section: "settings" | "queue") => void),
  controls: undefined as
    | undefined
    | { visible: boolean; initialSection: string; onClose: () => void },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [
    ui.section,
    (section: typeof ui.section) => {
      ui.section = section;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("expo-router", () => ({
  router: {
    canGoBack: () => ui.hasHistory,
    back: ui.back,
    replace: ui.replace,
  },
}));
vi.mock("lucide-react-native", () => ({
  ArrowLeft: () => null,
  MoreHorizontal: () => null,
}));
vi.mock("../src/shared/theme", () => ({ colors: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    ui.actions.push({ label, press: onPress });
    return null;
  },
  Button: ({
    children,
    onPress,
  }: PropsWithChildren<{ onPress: () => void }>) => {
    ui.actions.push({ label: String(children), press: onPress });
    return null;
  },
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ track: ui.track }),
}));
vi.mock("../src/features/audio/HymnNowPlaying", () => ({
  HymnNowPlaying: ({
    onRequestControls,
  }: {
    onRequestControls: NonNullable<typeof ui.request>;
  }) => {
    ui.request = onRequestControls;
    return React.createElement("div", null, "song-player");
  },
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: (props: typeof ui.controls) => {
    ui.controls = props;
    return null;
  },
}));
import HymnPlayerScreen from "../src/app/now-playing";
const render = () =>
  renderToStaticMarkup(React.createElement(HymnPlayerScreen));
beforeEach(() => {
  vi.clearAllMocks();
  ui.actions = [];
  ui.section = null;
  ui.track = { kind: "hymn" } as AudioTrack;
  ui.hasHistory = true;
});
it("renders a standalone player and returns through history", () => {
  expect(render()).toContain("song-player");
  ui.actions.find((action) => action.label === "返回聆听")!.press();
  expect(ui.back).toHaveBeenCalledOnce();
  expect(ui.replace).not.toHaveBeenCalled();
});
it("returns to the library when opened directly without history", () => {
  ui.hasHistory = false;
  render();
  ui.actions[0].press();
  expect(ui.replace).toHaveBeenCalledWith("/music");
});
it.each(["queue", "settings"] as const)(
  "opens %s on top of the player and closes it in place",
  (section) => {
    render();
    ui.request!(section);
    render();
    expect(ui.controls).toMatchObject({
      visible: true,
      initialSection: section,
    });
    ui.controls!.onClose();
    render();
    expect(ui.controls!.visible).toBe(false);
    expect(ui.back).not.toHaveBeenCalled();
  },
);
it("offers the song library when no hymn is selected", () => {
  ui.track = null;
  expect(render()).not.toContain("song-player");
  ui.actions.find((action) => action.label === "浏览诗歌")!.press();
  expect(ui.replace).toHaveBeenCalledWith("/music");
});

it("opens playback settings from the page header", () => {
  render();
  const settings = ui.actions.find((action) => action.label === "播放设置");
  expect(settings).toBeDefined();
  settings!.press();
  render();
  expect(ui.controls).toMatchObject({
    visible: true,
    initialSection: "settings",
  });
  expect(ui.back).not.toHaveBeenCalled();
});
