import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { FlatListProps, PressableProps, ViewStyle } from "react-native";
import type { AudioTrack } from "../src/domain/models";
import type { HymnReference } from "../src/domain/music-library";

const ui = vi.hoisted(() => ({
  currentId: "first",
  playing: true,
  toggle: vi.fn(),
  playQueue: vi.fn(),
  flatLists: [] as FlatListProps<HymnReference>[],
  titles: [] as {
    label?: string;
    style: ViewStyle;
    selected?: boolean;
    onPress?: PressableProps["onPress"];
  }[],
  views: [] as ViewStyle[],
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
  FlatList: (props: FlatListProps<HymnReference>) => {
    ui.flatLists.push(props);
    return React.createElement(
      "div",
      null,
      Array.from(props.data ?? []).map((item, index) =>
        React.createElement(
          React.Fragment,
          { key: props.keyExtractor?.(item, index) ?? item.id },
          props.renderItem?.({
            item,
            index,
            separators: {
              highlight() {},
              unhighlight() {},
              updateProps() {},
            },
          }),
        ),
      ),
    );
  },
  View: ({ children, style }: PropsWithChildren<{ style: ViewStyle }>) => {
    ui.views.push(style);
    return React.createElement("div", null, children);
  },
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
function render(virtualized = false) {
  ui.titles = [];
  ui.controls = [];
  ui.views = [];
  ui.flatLists = [];
  return renderToStaticMarkup(
    React.createElement(HymnList, {
      hymns: catalog,
      catalog,
      compact: true,
      showPlayButton: true,
      hideFavorite: true,
      virtualized,
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

it.each(["first", "second"])(
  "keeps the current-song background centered when %s is selected",
  (currentId) => {
    ui.currentId = currentId;
    render();
    const highlight = ui.views.find(
      (style) => style?.position === "absolute" && style.borderRadius === 8,
    );
    expect(highlight).toBeDefined();
    expect(highlight!.left).toBe(-10);
    expect(highlight!.right).toBe(highlight!.left);
  },
);

it("configures virtualized FlatList without Android view clipping and with a stable window", () => {
  render(true);
  expect(ui.flatLists).toHaveLength(1);
  expect(ui.flatLists[0].removeClippedSubviews).toBe(false);
  expect(ui.flatLists[0].windowSize).toBeGreaterThanOrEqual(9);
  expect(ui.titles).toHaveLength(2);
});
