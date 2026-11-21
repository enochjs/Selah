import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack, RepeatMode } from "../src/domain/models";
const harness = vi.hoisted(() => ({
  track: null as AudioTrack | null,
  position: 0,
  duration: 90,
  repeat: "off" as RepeatMode,
  playing: false,
  push: vi.fn(),
  toggle: vi.fn(),
  setRepeat: vi.fn(),
  previous: vi.fn(),
  next: vi.fn(),
  index: 0,
  queueLength: 3,
  state: null as unknown,
  width: 320,
  setVolume: vi.fn(),
  favorites: [] as { id: string; title: string }[],
  favorite: vi.fn(),
  containers: [] as { minHeight?: number; flexWrap?: string }[],
  slider: undefined as
    | undefined
    | {
        style: { height?: number; minWidth?: number };
        hitSlop?: { top: number; bottom: number };
        onValueChange: (value: number) => void;
      },
  actions: [] as { label: string; onPress: () => void; disabled?: boolean }[],
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
vi.mock("../src/features/audio/LyricMarquee", () => ({
  LyricMarquee: ({ text }: { text: string }) =>
    React.createElement("span", null, text),
}));
vi.mock("expo-router", () => ({ router: { push: harness.push } }));
vi.mock("../src/features/audio/RecordArtwork", () => ({
  RecordArtwork: () => React.createElement("span", null, "record-artwork"),
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    style,
  }: PropsWithChildren<{
    style?: { minHeight?: number; flexWrap?: string };
  }>) => {
    if (style) harness.containers.push(style);
    return React.createElement("div", null, children);
  },
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
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel },
      children,
    );
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
      "Shuffle",
      "ListEnd",
      "Volume2",
      "ListMusic",
      "AudioLines",
      "Heart",
    ].map((name) => [
      name,
      () => React.createElement("svg", { "data-icon": name }),
    ]),
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
  IconButton: ({
    icon: Icon,
    label,
    onPress,
    disabled,
  }: {
    icon: React.ComponentType;
    label: string;
    onPress: () => void;
    disabled?: boolean;
  }) => {
    harness.actions.push({ label, onPress, disabled });
    return React.createElement(
      "button",
      null,
      React.createElement(Icon),
      label,
    );
  },
}));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {}, images: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (
    select: (state: {
      favoriteHymns: typeof harness.favorites;
      toggleFavoriteHymn: typeof harness.favorite;
    }) => unknown,
  ) =>
    select({
      favoriteHymns: harness.favorites,
      toggleFavoriteHymn: harness.favorite,
    }),
}));
vi.mock("../src/features/audio/useHymns", () => ({
  useHymns: () => (harness.track?.kind === "hymn" ? [harness.track] : []),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudioProgress: () => ({
    position: harness.position,
    duration: harness.duration,
  }),
  useAudio: () => ({
    track: harness.track,
    queue: harness.track ? Array(harness.queueLength).fill(harness.track) : [],
    index: harness.index,
    playing: harness.playing,
    toggle: harness.toggle,
    setRepeat: harness.setRepeat,
    previous: harness.previous,
    next: harness.next,
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
  harness.containers = [];
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
  harness.position = 0;
  harness.duration = 90;
  harness.repeat = "off";
  harness.playing = false;
  harness.push.mockClear();
  harness.toggle.mockClear();
  harness.setRepeat.mockClear();
  harness.previous.mockClear();
  harness.next.mockClear();
  harness.index = 0;
  harness.queueLength = 3;
  harness.state = null;
  harness.width = 320;
  harness.slider = undefined;
  harness.setVolume.mockClear();
  harness.favorites = [];
  harness.favorite.mockClear();
});
it("keeps the player favorite action in sync with the song list without toggling playback", () => {
  harness.width = 1280;
  render();
  harness.actions.find((a) => a.label === "收藏 奇异恩典")!.onPress();
  expect(harness.favorite).toHaveBeenCalledWith({
    id: "amazing-grace",
    title: "奇异恩典",
  });
  expect(harness.toggle).not.toHaveBeenCalled();
  harness.favorites = [{ id: "amazing-grace", title: "奇异恩典" }];
  render();
  expect(harness.actions.some((a) => a.label === "取消收藏 奇异恩典")).toBe(
    true,
  );
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
it.each([320, 393, 1280])(
  "cycles repeat directly at width %s without opening controls or changing playback",
  (width) => {
    harness.width = width;
    for (const [repeat, label, next] of [
      ["off", "顺序播放", "verse"],
      ["verse", "单曲循环", "chapter"],
      ["chapter", "列表循环", "shuffle"],
      ["shuffle", "随机播放", "off"],
    ] as const) {
      harness.repeat = repeat;
      harness.setRepeat.mockClear();
      expect(render()).toContain(label);
      harness.actions.find((a) => a.label === `循环方式：${label}`)!.onPress();
      expect(harness.setRepeat).toHaveBeenCalledExactlyOnceWith(next);
      render();
      expect(harness.dialog?.visible).toBe(false);
      expect(harness.state).toBeNull();
      expect(harness.toggle).not.toHaveBeenCalled();
      expect(harness.next).not.toHaveBeenCalled();
    }
  },
);
it.each([
  ["播放速度，当前 1 倍", "settings"],
  ["播放队列", "queue"],
])("opens %s in its requested section", (label, initialSection) => {
  harness.width = 1280;
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

it("opens the standalone player from the song title without interrupting playback", () => {
  render();
  harness.actions
    .find((action) => action.label === "查看 奇异恩典 的歌词")!
    .onPress();
  expect(harness.push).toHaveBeenCalledWith("/now-playing");
  expect(harness.toggle).not.toHaveBeenCalled();
});

it.each([320, 393, 759])(
  "keeps every transport action available in the compact player at width %s",
  (width) => {
    harness.width = width;
    render();
    expect(harness.actions.map((action) => action.label)).toEqual([
      "打开播放器：奇异恩典",
      "查看 奇异恩典 的歌词",
      "上一曲",
      "播放",
      "下一曲",
      "循环方式：顺序播放",
    ]);
    expect(harness.containers[0]).toMatchObject({
      flexShrink: 0,
    });
  },
);

it.each([320, 375, 393, 759])(
  "gives timed lyrics their own row outside the title control at width %s",
  (width) => {
    harness.width = width;
    harness.track = {
      ...harness.track!,
      lyrics: "[00:00]你恩典长阔高深，我心要歌唱",
    };
    const html = render();
    const titleContents = html.match(
      /<button aria-label="查看 奇异恩典 的歌词">([\s\S]*?)<\/button>/,
    )?.[1];
    expect(titleContents).toContain("奇异恩典");
    expect(titleContents).not.toContain("你恩典长阔高深，我心要歌唱");
    expect(html.match(/你恩典长阔高深，我心要歌唱/g)).toHaveLength(1);
  },
);

it.each([320, 375, 393, 759])(
  "switches songs directly from the mobile bar at width %s",
  (width) => {
    harness.width = width;
    expect(render()).toContain("record-artwork");
    harness.actions.find((action) => action.label === "上一曲")!.onPress();
    harness.actions.find((action) => action.label === "下一曲")!.onPress();
    expect(harness.previous).toHaveBeenCalledOnce();
    expect(harness.next).toHaveBeenCalledOnce();
    expect(harness.push).not.toHaveBeenCalled();
    expect(harness.toggle).not.toHaveBeenCalled();
  },
);

it.each([
  ["off", true],
  ["verse", true],
  ["chapter", false],
  ["shuffle", false],
] as const)(
  "keeps the final song next control consistent with %s mode",
  (repeat, disabled) => {
    harness.index = 2;
    harness.repeat = repeat;
    render();
    expect(
      harness.actions.find((action) => action.label === "下一曲")?.disabled,
    ).toBe(disabled);
  },
);

it("follows the current timed lyric through playback, seeks and pauses", () => {
  harness.track = {
    ...harness.track!,
    lyrics: "[00:05]第一句\n[00:12]第二句\n[00:20]",
  };
  expect(render()).toContain("传统赞美诗");
  harness.position = 5;
  expect(render()).toContain("第一句");
  harness.position = 14;
  expect(render()).toContain("第二句");
  expect(render()).not.toContain("第一句");
  harness.playing = false;
  expect(render()).toContain("第二句");
  harness.position = 8;
  expect(render()).toContain("第一句");
  harness.position = 21;
  expect(render()).toContain("传统赞美诗");
});
it("keeps untimed lyrics in details instead of guessing a current line", () => {
  harness.track = { ...harness.track!, lyrics: "第一句\n第二句" };
  harness.position = 14;
  expect(render()).toContain("传统赞美诗");
  expect(render()).not.toContain("第一句");
});
it("flattens simultaneous translations to one readable mini-player line", () => {
  harness.track = {
    ...harness.track!,
    lyrics: "[00:00]Amazing grace\n[00:00]奇异恩典",
  };
  expect(render()).toContain("Amazing grace · 奇异恩典");
});

it("uses real performer metadata during the intro and the timed lyric once singing starts", () => {
  harness.track = {
    ...harness.track!,
    subtitle: "专辑说明",
    lyrics: "[00:10]当前唱词",
    hymn: {
      id: "amazing-grace",
      titleZh: "奇异恩典",
      titleEn: "Amazing Grace",
      subtitleZh: "专辑说明",
      subtitleEn: "Album",
      artist: "真实演唱者",
      duration: 90,
      audioPath: "/api/hymns/song/audio",
      enabled: true,
    },
  };
  expect(render()).toContain("真实演唱者");
  expect(render()).not.toContain("歌词 · 播放详情");
  harness.position = 11;
  expect(render()).toContain("当前唱词");
  expect(render()).not.toContain("真实演唱者");
});

it("keeps absent metadata honest with a short lyrics entry", () => {
  harness.track = { ...harness.track!, subtitle: "" };
  expect(render()).toContain("查看歌词");
  expect(render()).not.toContain("歌词 · 播放详情");
});
