import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { FlatListProps, ViewProps } from "react-native";
import type { ChapterPage } from "../src/features/reader/chapter-pagination";

const context = vi.hoisted(() => ({
  props: null as FlatListProps<ChapterPage> | null,
  cell: null as ViewProps | null,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 400 }),
  View: (props: ViewProps) => {
    context.cell = props;
    return null;
  },
  FlatList: (props: FlatListProps<ChapterPage>) => {
    context.props = props;
    return null;
  },
}));
import { ChapterPager } from "../src/features/reader/ChapterPager";
afterEach(() => vi.useRealTimers());

it("commits a snapped browser page using real Web scroll events, without native momentum events", () => {
  vi.useFakeTimers();
  const selected = vi.fn();
  renderToStaticMarkup(
    React.createElement(ChapterPager, {
      pages: [
        { bookId: "genesis", chapter: 1 },
        { bookId: "genesis", chapter: 2 },
      ],
      index: 0,
      enabled: true,
      onBeforeChange: vi.fn(),
      onSelect: selected,
      renderPage: () => null,
    }),
  );
  const onScroll = context.props?.onScroll;
  expect(onScroll).toBeDefined();
  if (!onScroll) return;
  const event = (x: number) =>
    ({ nativeEvent: { contentOffset: { x } } }) as Parameters<
      typeof onScroll
    >[0];
  onScroll(event(160));
  vi.advanceTimersByTime(60);
  onScroll(event(400));
  expect(selected).not.toHaveBeenCalled();
  vi.advanceTimersByTime(160);
  expect(selected).toHaveBeenCalledWith({ bookId: "genesis", chapter: 2 });
  onScroll(event(400));
  vi.advanceTimersByTime(160);
  expect(selected).toHaveBeenCalledOnce();
});

it("bounds the browser chapter row to its viewport so long chapters scroll vertically", () => {
  renderToStaticMarkup(
    React.createElement(ChapterPager, {
      pages: [{ bookId: "psalms", chapter: 23 }],
      index: 0,
      enabled: true,
      onBeforeChange: vi.fn(),
      onSelect: vi.fn(),
      renderPage: () => null,
    }),
  );
  expect(context.props?.contentContainerStyle).toMatchObject({
    height: "100%",
  });
  const Cell = context.props?.CellRendererComponent;
  expect(Cell).toBeTypeOf("function");
  if (!Cell) throw new Error("Missing bounded chapter cell");
  const onLayout = vi.fn();
  const onFocusCapture = vi.fn();
  renderToStaticMarkup(
    React.createElement(Cell, {
      cellKey: "psalms:23",
      index: 0,
      item: { bookId: "psalms", chapter: 23 },
      style: { flexDirection: "row" },
      onLayout,
      onFocusCapture,
      children: "chapter",
    }),
  );
  expect(context.cell).toMatchObject({
    style: [{ flexDirection: "row" }, { height: "100%" }],
    onLayout,
    onFocusCapture,
    children: "chapter",
  });
});
