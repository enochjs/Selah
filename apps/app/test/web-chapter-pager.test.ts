import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import type { FlatListProps } from "react-native";
import type { ChapterPage } from "../src/features/reader/chapter-pagination";

const context = vi.hoisted(() => ({
  props: null as FlatListProps<ChapterPage> | null,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ width: 400 }),
  View: () => null,
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
