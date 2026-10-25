import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";
const harness = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
  actions: [] as {
    label: string;
    onPress: () => void;
    onLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
  }[],
  dialog: undefined as
    | undefined
    | { onDismiss?: () => void; presentation?: string; heightMode?: string },
  scrolls: [] as { text: string }[],
  width: 393,
  queue: [] as AudioTrack[],
  index: 0,
  playing: false,
  slider: undefined as
    | undefined
    | {
        accessibilityLabel: string;
        style: { height?: number; minWidth?: number };
        hitSlop?: { top: number; bottom: number };
        onValueChange: (value: number) => void;
      },
  scrollTo: vi.fn(),
  playQueue: vi.fn(),
  toggle: vi.fn(),
  setRate: vi.fn(),
  setRepeat: vi.fn(),
  setVolume: vi.fn(),
  previous: vi.fn(),
  next: vi.fn(),
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.cells)) harness.cells[index] = initial;
    return [
      harness.cells[index],
      (next: unknown) => {
        harness.cells[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = harness.cursor++;
    if (!(index in harness.cells)) harness.cells[index] = { current: initial };
    return harness.cells[index];
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const index = harness.cursor++;
    const old = harness.cells[index] as unknown[] | undefined;
    if (!old || deps.some((dep, i) => !Object.is(dep, old[i]))) {
      harness.cells[index] = deps;
      harness.effects.push(effect);
    }
  },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({
    children,
    ref,
  }: PropsWithChildren<{
    ref?: { current: { scrollTo: typeof harness.scrollTo } | null };
  }>) => {
    if (ref) ref.current = { scrollTo: harness.scrollTo };
    const html = renderToStaticMarkup(
      React.createElement("section", null, children),
    );
    harness.scrolls.push({ text: html });
    return React.createElement("section", null, children);
  },
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
    onLayout,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
    onLayout?: (event: { nativeEvent: { layout: { y: number } } }) => void;
  }>) => {
    harness.actions.push({ label: accessibilityLabel, onPress, onLayout });
    return React.createElement("button", null, children);
  },
  useWindowDimensions: () => ({ width: harness.width }),
}));
vi.mock("@react-native-community/slider", () => ({
  default: (props: NonNullable<typeof harness.slider>) => {
    harness.slider = props;
    return React.createElement("input");
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "ArrowUpRight",
      "Check",
      "Download",
      "Pause",
      "Play",
      "SkipBack",
      "SkipForward",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("expo-router", () => ({ router: { push: vi.fn() } }));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  Dialog: ({
    children,
    title,
    ...props
  }: PropsWithChildren<{ title: string }>) => {
    harness.dialog = props;
    return React.createElement("div", null, title, children);
  },
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    harness.actions.push({ label, onPress });
    return React.createElement("button", null, label);
  },
  Pill: ({ children, onPress }: PropsWithChildren<{ onPress: () => void }>) => {
    harness.actions.push({
      label: React.Children.toArray(children).join(""),
      onPress,
    });
    return React.createElement("button", null, children);
  },
  Button: ({
    children,
    onPress,
  }: PropsWithChildren<{ onPress: () => void }>) => {
    harness.actions.push({
      label: React.Children.toArray(children).join(""),
      onPress,
    });
    return React.createElement("button", null, children);
  },
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    ...harness,
    track: harness.queue[harness.index],
    rate: 1.25,
    repeat: "off",
    volume: 0.8,
  }),
}));
import { AudioControlsDialog } from "../src/features/audio/AudioControlsDialog";
const onClose = vi.fn();
function render(
  initialSection: "settings" | "queue" = "settings",
  visible = true,
  context?: { title: string; queue: AudioTrack[]; index: number },
) {
  const draw = () => {
    harness.cursor = 0;
    harness.actions = [];
    harness.scrolls = [];
    return renderToStaticMarkup(
      React.createElement(AudioControlsDialog, {
        visible,
        onClose,
        initialSection,
        context,
      }),
    );
  };
  draw();
  harness.effects.splice(0).forEach((effect) => effect());
  return draw();
}
beforeEach(() => {
  harness.cursor = 0;
  harness.cells = [];
  harness.effects = [];
  harness.width = 393;
  harness.index = 74;
  harness.queue = Array.from({ length: 150 }, (_, i) => ({
    id: `track-${i}`,
    title: `曲目 ${i + 1}`,
    subtitle: "完整来源",
    artwork: 1,
    kind: "hymn",
    source: 1,
  }));
  vi.clearAllMocks();
});
it("opens the requested queue with fixed summary and no settings mixed into its scroller", () => {
  const html = render("queue");
  expect(html).toContain("曲目 150");
  expect(html).not.toContain("播放速度");
  expect(harness.scrolls).toHaveLength(1);
  expect(harness.scrolls[0].text).not.toContain("上一节或上一曲");
  expect(harness.dialog).toMatchObject({
    presentation: "bottom",
    heightMode: "large",
  });
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it("opens settings first and changes speed without starting playback", () => {
  const html = render();
  expect(html).toContain("播放速度");
  expect(html).not.toContain("曲目 150");
  expect(html.indexOf("播放速度")).toBeLessThan(html.indexOf("循环方式"));
  expect(html.indexOf("循环方式")).toBeLessThan(html.indexOf("音量"));
  harness.actions.find((action) => action.label === "1.5×")!.onPress();
  expect(harness.setRate).toHaveBeenCalledWith(1.5);
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it("reopens according to the latest entry instead of the previous section", () => {
  render("queue");
  render("queue", false);
  expect(render("settings")).toContain("播放速度");
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it("retains exact queue item playback and closes afterwards", () => {
  render("queue");
  harness.actions.find((action) => action.label === "播放 曲目 150")!.onPress();
  expect(harness.playQueue).toHaveBeenCalledWith(harness.queue, 149);
  expect(onClose).toHaveBeenCalledOnce();
});
it("does not offer verse repeat for whole-chapter audio", () => {
  harness.queue = [
    {
      id: "chapter",
      title: "诗篇 23",
      kind: "scripture",
      source: { uri: "test.mp3" },
      subtitle: "整章",
      artwork: 1,
      bookId: "psalms",
      chapter: 23,
      locale: "zh",
    },
  ];
  harness.index = 0;
  const html = render();
  expect(html).not.toContain("单句循环");
  expect(html).toContain("整章循环");
});
it("keeps a pending context hint and an empty queue state", () => {
  expect(
    render("settings", true, {
      title: "尚未播放",
      queue: [
        {
          id: "other",
          title: "另一首",
          subtitle: "来源",
          artwork: 1,
          kind: "hymn",
          source: 1,
        },
      ],
      index: 0,
    }),
  ).toContain("应用于本节开始播放时");
  harness.cells = [];
  harness.queue = [];
  expect(render("queue")).toContain("选择一段经文或一首诗歌");
});

it("locates the current item by its measured offset without starting playback", () => {
  render("queue");
  const current = harness.actions.find(
    (action) => action.label === "播放 曲目 75",
  )!;
  current.onLayout!({ nativeEvent: { layout: { y: 6400 } } });
  expect(harness.scrollTo).toHaveBeenCalledWith({ y: 6388, animated: false });
  current.onLayout!({ nativeEvent: { layout: { y: 6400 } } });
  expect(harness.scrollTo).toHaveBeenCalledOnce();
  expect(harness.playQueue).not.toHaveBeenCalled();
});
it("switches sections for browsing without mutating playback or queue", () => {
  render();
  harness.actions
    .find((action) => action.label === "播放队列 · 150")!
    .onPress();
  expect(render()).toContain("曲目 150");
  expect(harness.playQueue).not.toHaveBeenCalled();
  expect(harness.setRepeat).not.toHaveBeenCalled();
});
it("resets an internally changed section on reopening the same entry", () => {
  render();
  harness.actions
    .find((action) => action.label === "播放队列 · 150")!
    .onPress();
  expect(render()).toContain("曲目 150");
  render("settings", false);
  expect(render()).toContain("播放速度");
});

it("reserves a 44px volume responder and keeps direct volume changes", () => {
  render();
  expect(harness.slider?.accessibilityLabel).toBe("播放音量");
  expect(harness.slider?.style.height ?? 0).toBeGreaterThanOrEqual(44);
  expect(harness.slider?.style.minWidth ?? 0).toBeGreaterThanOrEqual(44);
  // iOS keeps its inner 40px native slider; hit slop extends to the 44px host bounds.
  expect(harness.slider?.hitSlop?.top ?? 0).toBeGreaterThanOrEqual(2);
  expect(harness.slider?.hitSlop?.bottom ?? 0).toBeGreaterThanOrEqual(2);
  harness.slider!.onValueChange(0.35);
  expect(harness.setVolume).toHaveBeenCalledWith(0.35);
  expect(harness.playQueue).not.toHaveBeenCalled();
});
