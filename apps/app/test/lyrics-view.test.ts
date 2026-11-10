import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import { parseLyrics } from "../src/domain/lyrics";

const ui = vi.hoisted(() => ({
  actions: [] as {
    label: string;
    press: () => void;
    selected?: boolean;
    layout?: (event: {
      nativeEvent: { layout: { y: number; height: number } };
    }) => void;
  }[],
  scroll: undefined as
    | undefined
    | {
        onBrowse: () => void;
        onLayout: (event: {
          nativeEvent: { layout: { height: number } };
        }) => void;
        onContentSizeChange: () => void;
      },
  scrollTo: vi.fn(),
  playFrom: vi.fn(),
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.cells)) ui.cells[index] = initial;
    return [
      ui.cells[index],
      (next: unknown) => {
        ui.cells[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = ui.cursor++;
    if (!(index in ui.cells)) ui.cells[index] = { current: initial };
    return ui.cells[index];
  },
  useEffect: (effect: () => void, deps: unknown[]) => {
    const index = ui.cursor++;
    const previous = ui.cells[index] as unknown[] | undefined;
    if (!previous || deps.some((dep, i) => !Object.is(dep, previous[i]))) {
      ui.cells[index] = deps;
      ui.effects.push(effect);
    }
  },
}));
vi.mock("expo-linear-gradient", () => ({ LinearGradient: () => null }));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    accessibilityState,
    onLayout,
  }: PropsWithChildren<{
    onPress: () => void;
    accessibilityLabel: string;
    accessibilityState?: { selected?: boolean };
    onLayout?: (event: {
      nativeEvent: { layout: { y: number; height: number } };
    }) => void;
  }>) => {
    ui.actions.push({
      label: accessibilityLabel,
      press: onPress,
      selected: accessibilityState?.selected,
      layout: onLayout,
    });
    return React.createElement("button", null, children);
  },
}));
vi.mock("../src/features/audio/LyricScrollView", () => ({
  LyricScrollView: ({
    children,
    scrollRef,
    ...props
  }: PropsWithChildren<{ scrollRef: { current: unknown } }>) => {
    scrollRef.current = { scrollTo: ui.scrollTo };
    ui.scroll = props as typeof ui.scroll;
    return React.createElement("div", null, children);
  },
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {} }));
import { LyricsView } from "../src/features/audio/LyricsView";
const timed = parseLyrics("[00:05]First line\n[00:12]Second line", 40);
function render(position = 5, lyrics = timed) {
  ui.cursor = 0;
  ui.actions = [];
  const html = renderToStaticMarkup(
    React.createElement(LyricsView, {
      lyrics,
      position,
      onPlayFrom: ui.playFrom,
    }),
  );
  ui.effects.splice(0).forEach((effect) => effect());
  return html;
}
beforeEach(() => {
  ui.cells = [];
  ui.effects = [];
  ui.scrollTo.mockClear();
  ui.playFrom.mockClear();
});
it("highlights the real current line and plays the selected timestamp", () => {
  render();
  expect(ui.actions.find((action) => action.selected)?.label).toContain(
    "First line",
  );
  ui.actions.find((action) => action.label.includes("Second line"))!.press();
  expect(ui.playFrom).toHaveBeenCalledWith(12);
  render(13);
  expect(ui.actions.find((action) => action.selected)?.label).toContain(
    "Second line",
  );
});
it("lets users browse without jumping playback and explicitly return to the current line", () => {
  render();
  ui.actions.find((action) => action.label.includes("First line"))!.layout!({
    nativeEvent: { layout: { y: 100, height: 60 } },
  });
  ui.actions.find((action) => action.label.includes("Second line"))!.layout!({
    nativeEvent: { layout: { y: 160, height: 60 } },
  });
  ui.scroll!.onBrowse();
  ui.scrollTo.mockClear();
  render(13);
  expect(ui.playFrom).not.toHaveBeenCalled();
  expect(ui.scrollTo).not.toHaveBeenCalled();
  ui.actions.find((action) => action.label === "回到当前歌词")!.press();
  render(13);
  expect(ui.actions.some((action) => action.label === "回到当前歌词")).toBe(
    false,
  );
  expect(ui.scrollTo).toHaveBeenLastCalledWith({ y: 60, animated: true });
});

it("centers measured variable-height lyric rows when the current line changes", () => {
  render();
  ui.actions.find((action) => action.label.includes("First line"))!.layout!({
    nativeEvent: { layout: { y: 100, height: 60 } },
  });
  ui.actions.find((action) => action.label.includes("Second line"))!.layout!({
    nativeEvent: { layout: { y: 160, height: 120 } },
  });
  expect(ui.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  ui.scrollTo.mockClear();
  render(13);
  expect(ui.scrollTo).toHaveBeenLastCalledWith({ y: 90, animated: true });
  render(5);
  expect(ui.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: true });
});
it("shows plain lyrics without fake jump buttons and a useful empty state", () => {
  expect(render(0, parseLyrics("First line\nSecond line"))).toContain(
    "First line",
  );
  expect(ui.actions).toHaveLength(0);
  expect(render(0, parseLyrics(undefined))).toContain("暂无歌词");
});
