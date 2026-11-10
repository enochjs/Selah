import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack, RepeatMode } from "../src/domain/models";

const ui = vi.hoisted(() => ({
  track: {
    id: "song",
    kind: "hymn",
    title: "诗歌",
    subtitle: "演唱者",
    source: 1,
    artwork: 1,
  } as AudioTrack,
  repeat: "off" as RepeatMode,
  playing: false,
  width: 320,
  height: 720,
  actions: [] as { label: string; press: () => void; disabled?: boolean }[],
  images: 0,
  dialog: undefined as
    undefined | { header?: React.ReactNode; bodyStyle?: unknown },
  controls: vi.fn(),
  toggle: vi.fn(),
  setRepeat: vi.fn(),
  favorite: vi.fn(),
  seek: vi.fn(),
  slider: undefined as
    undefined | { onSlidingComplete: (time: number) => void },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Image: () => {
    ui.images++;
    return null;
  },
  ActivityIndicator: () => null,
  useWindowDimensions: () => ({ width: ui.width, height: ui.height }),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
  }: PropsWithChildren<{
    onPress: () => void;
    accessibilityLabel: string;
  }>) => {
    ui.actions.push({ label: accessibilityLabel, press: onPress });
    return React.createElement("button", null, children);
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Pause",
      "Play",
      "SkipBack",
      "SkipForward",
      "Heart",
      "Repeat",
      "Repeat1",
      "ListMusic",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("@react-native-community/slider", () => ({
  default: (props: typeof ui.slider) => {
    ui.slider = props;
    return null;
  },
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: ({
    label,
    onPress,
    disabled,
  }: {
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => {
    ui.actions.push({ label, press: onPress, disabled });
    return React.createElement("button", null, label);
  },
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  images: { morning: 1 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: unknown) => unknown) =>
    select({ favoriteHymns: [], toggleFavoriteHymn: ui.favorite }),
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymns: () => [ui.track],
}));
vi.mock("../src/features/audio/LyricsView", () => ({
  LyricsView: () => React.createElement("div", null, "timed-lyrics"),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    track: ui.track,
    playing: ui.playing,
    rate: 1,
    index: 0,
    queue: [ui.track],
    repeat: ui.repeat,
    toggle: ui.toggle,
    setRepeat: ui.setRepeat,
    seek: ui.seek,
  }),
  useAudioProgress: () => ({ position: 5, duration: 60 }),
}));
import { HymnNowPlaying } from "../src/features/audio/HymnNowPlaying";
function render() {
  ui.actions = [];
  ui.images = 0;
  return renderToStaticMarkup(
    React.createElement(HymnNowPlaying, { onRequestControls: ui.controls }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  ui.track.lyrics = undefined;
  ui.repeat = "off";
  ui.playing = false;
  ui.height = 720;
});

it.each([320, 393, 1280])(
  "provides one complete transport with queue and repeat at width %s",
  (width) => {
    ui.width = width;
    render();
    expect(
      ui.actions.filter((action) => action.label === "播放诗歌"),
    ).toHaveLength(1);
    expect(
      ui.actions.find((action) => action.label === "下一曲")?.disabled,
    ).toBe(true);
    ui.actions.find((action) => action.label === "顺序播放")!.press();
    expect(ui.setRepeat).toHaveBeenCalledWith("verse");
    ui.actions.find((action) => action.label === "播放队列")!.press();
    expect(ui.controls).toHaveBeenCalledWith("queue");
    ui.slider!.onSlidingComplete(22);
    expect(ui.seek).toHaveBeenCalledWith(22);
    expect(ui.toggle).not.toHaveBeenCalled();
  },
);
it("shows artwork when no lyrics are available and keeps timed lyrics in the lyric view", () => {
  expect(render()).toContain("暂无歌词");
  expect(ui.images).toBe(1);
  ui.track.lyrics = "[00:01]First line";
  expect(render()).toContain("timed-lyrics");
});

it("keeps the no-lyrics message and controls available in a short landscape viewport", () => {
  ui.width = 844;
  ui.height = 390;
  expect(render()).toContain("暂无歌词");
  expect(ui.images).toBe(0);
  expect(ui.actions.some((action) => action.label === "播放诗歌")).toBe(true);
});

it("keeps repeat status on its control without a duplicate footer label", () => {
  const html = render();
  expect(html.match(/顺序播放/g)).toHaveLength(1);
});
