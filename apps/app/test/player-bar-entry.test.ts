import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack, RepeatMode } from "../src/domain/models";
const harness = vi.hoisted(() => ({
  track: null as AudioTrack | null,
  repeat: "off" as RepeatMode,
  playing: false,
  toggle: vi.fn(),
  setRepeat: vi.fn(),
  state: null as unknown,
  width: 320,
  setVolume: vi.fn(),
  slider: undefined as
    | undefined
    | {
        style: { height?: number; minWidth?: number };
        hitSlop?: { top: number; bottom: number };
        onValueChange: (value: number) => void;
      },
  actions: [] as { label: string; onPress: () => void }[],
  dialog: undefined as
    undefined | { visible: boolean; initialSection?: string },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => [
    harness.state ?? initial,
    (value: unknown) => {
      harness.state = value;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Image: () => null,
  useWindowDimensions: () => ({ width: harness.width }),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    harness.actions.push({ label: accessibilityLabel, onPress });
    return React.createElement("button", null, children);
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Play",
      "Pause",
      "SkipBack",
      "SkipForward",
      "Repeat",
      "Repeat1",
      "Volume2",
      "ListMusic",
      "AudioLines",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("@react-native-community/slider", () => ({
  default: (props: NonNullable<typeof harness.slider>) => {
    harness.slider = props;
    return null;
  },
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    harness.actions.push({ label, onPress });
    return React.createElement("button", null, label);
  },
}));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {}, images: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (
    select: (state: { bookId: string; chapter: number }) => unknown,
  ) => select({ bookId: "psalms", chapter: 23 }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    track: harness.track,
    queue: harness.track ? [harness.track] : [],
    index: 0,
    playing: harness.playing,
    toggle: harness.toggle,
    setRepeat: harness.setRepeat,
    rate: 1,
    repeat: harness.repeat,
    setVolume: harness.setVolume,
  }),
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: (props: typeof harness.dialog) => {
    harness.dialog = props;
    return null;
  },
}));
import { PlayerBar } from "../src/features/audio/PlayerBar";
function render() {
  harness.actions = [];
  return renderToStaticMarkup(React.createElement(PlayerBar));
}
beforeEach(() => {
  harness.track = {
    id: "amazing-grace",
    kind: "hymn",
    title: "奇异恩典",
    subtitle: "传统赞美诗",
    source: 1,
    artwork: 1,
  };
  harness.repeat = "off";
  harness.playing = false;
  harness.toggle.mockClear();
  harness.setRepeat.mockClear();
  harness.state = null;
  harness.width = 320;
  harness.slider = undefined;
  harness.setVolume.mockClear();
});
it.each([320, 1280])(
  "does not offer chapter fallback playback without selected music at width %s",
  (width) => {
    harness.width = width;
    harness.track = null;
    expect(render()).toBe("");
    expect(harness.actions).toEqual([]);
  },
);
it.each([false, true])(
  "hides scripture narration from the music bar while playing=%s",
  (playing) => {
    harness.track = {
      ...harness.track!,
      kind: "scripture",
      title: "诗篇 23",
      bookId: "psalms",
      chapter: 23,
    };
    harness.playing = playing;
    expect(render()).toBe("");
    expect(harness.toggle).not.toHaveBeenCalled();
  },
);
it.each([false, true])(
  "shows selected music and toggles it while playing=%s",
  (playing) => {
    harness.playing = playing;
    expect(render()).toContain("奇异恩典");
    harness.actions
      .find((action) => action.label === (playing ? "暂停" : "播放"))!
      .onPress();
    expect(harness.toggle).toHaveBeenCalledOnce();
  },
);
it.each([
  ["off", "顺序播放", "verse"],
  ["verse", "单曲循环", "chapter"],
  ["chapter", "列表循环", "off"],
] as const)(
  "uses music terminology for %s repeat mode",
  (repeat, label, next) => {
    harness.repeat = repeat;
    render();
    expect(harness.actions.map((a) => a.label)).toContain("上一曲");
    expect(harness.actions.map((a) => a.label)).toContain("下一曲");
    harness.actions.find((a) => a.label === label)!.onPress();
    expect(harness.setRepeat).toHaveBeenCalledWith(next);
  },
);
it.each([
  ["播放速度，当前 1 倍", "settings"],
  ["播放队列", "queue"],
])("opens %s in its requested section", (label, initialSection) => {
  render();
  harness.actions.find((action) => action.label === label)!.onPress();
  render();
  expect(harness.dialog).toMatchObject({ visible: true, initialSection });
});

it("keeps the desktop volume responder at least 44px with direct volume control", () => {
  harness.width = 1280;
  render();
  expect(harness.slider?.style.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(harness.slider?.style.minWidth ?? 0).toBeGreaterThanOrEqual(44);
  expect(harness.slider?.hitSlop?.top ?? 0).toBeGreaterThanOrEqual(2);
  expect(harness.slider?.hitSlop?.bottom ?? 0).toBeGreaterThanOrEqual(2);
  harness.slider!.onValueChange(0.45);
  expect(harness.setVolume).toHaveBeenCalledWith(0.45);
});
