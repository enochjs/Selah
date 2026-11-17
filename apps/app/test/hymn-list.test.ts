import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PressableProps, ViewStyle } from "react-native";
import type { AudioTrack } from "../src/domain/models";

const ui = vi.hoisted(() => ({
  currentId: "first",
  playing: true,
  toggle: vi.fn(),
  playQueue: vi.fn(),
  titles: [] as {
    label?: string;
    style: ViewStyle;
    selected?: boolean;
    onPress?: PressableProps["onPress"];
  }[],
  controls: [] as {
    label: string;
    active?: boolean;
    activeStyle?: string;
    visualSize?: number;
    targetWidth?: number;
    onPress: () => void;
  }[],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: (props: PressableProps) => {
    ui.titles.push({
      label: props.accessibilityLabel,
      style: (typeof props.style === "function"
        ? props.style({ pressed: false })
        : props.style) as ViewStyle,
      selected: props.accessibilityState?.selected,
      onPress: props.onPress,
    });
    return React.createElement(
      "button",
      null,
      props.children as React.ReactNode,
    );
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Play",
      "Pause",
      "Heart",
      "Plus",
      "Trash2",
      "ArrowUp",
      "ArrowDown",
      "MoreHorizontal",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: (props: (typeof ui.controls)[number]) => {
    ui.controls.push(props);
    return null;
  },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {} }));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: { favoriteHymns: never[] }) => unknown) =>
    select({ favoriteHymns: [] }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    track: { id: ui.currentId },
    playing: ui.playing,
    toggle: ui.toggle,
    playQueue: ui.playQueue,
  }),
}));
vi.mock("../src/features/downloads/HymnDownloadButton", () => ({
  HymnDownloadButton: () => null,
}));

import { HymnList } from "../src/features/audio/HymnList";
const catalog: AudioTrack[] = ["first", "second"].map((id) => ({
  id,
  title: id,
  subtitle: "演唱者 · 专辑",
  kind: "hymn",
  source: 1,
  artwork: 1,
}));
function render() {
  ui.titles = [];
  ui.controls = [];
  return renderToStaticMarkup(
    React.createElement(HymnList, {
      hymns: catalog,
      catalog,
      compact: true,
      showPlayButton: true,
      hideFavorite: true,
      onMore: vi.fn(),
      onAdd: vi.fn(),
    }),
  );
}
beforeEach(() => {
  vi.clearAllMocks();
  ui.currentId = "first";
  ui.playing = true;
});
it("keeps title alignment and hit areas stable when the current song changes", () => {
  render();
  const before = ui.titles.map((title) => title.style);
  expect(before[0].paddingLeft ?? 0).toBe(before[1].paddingLeft ?? 0);
  ui.currentId = "second";
  render();
  expect(ui.titles.map((title) => title.style)).toEqual(before);
  expect(ui.titles.every((title) => Number(title.style.minHeight) >= 44)).toBe(
    true,
  );
});
it.each([true, false])(
  "retains current-song semantics while playing=%s",
  (playing) => {
    ui.playing = playing;
    render();
    expect(ui.titles.map((title) => title.selected)).toEqual([true, false]);
    const current = ui.controls.find((control) => control.active);
    expect(current).toMatchObject({
      label: playing ? "暂停 first" : "继续播放 first",
      activeStyle: "surface",
      visualSize: 32,
      targetWidth: 48,
    });
    current!.onPress();
    expect(ui.toggle).toHaveBeenCalledOnce();
    expect(ui.playQueue).not.toHaveBeenCalled();
  },
);
it("plays another song in the existing list order", () => {
  render();
  ui.controls.find((control) => control.label === "播放 second")!.onPress();
  expect(ui.playQueue).toHaveBeenCalledWith(catalog, 1);
});
