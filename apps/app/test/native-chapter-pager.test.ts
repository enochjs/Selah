import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PagerViewProps } from "react-native-pager-view";
import type { ChapterPagerProps } from "../src/features/reader/chapter-pager-props";

const context = vi.hoisted(() => ({
  nativeProps: null as PagerViewProps | null,
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("react-native-pager-view", () => ({
  default: (props: PagerViewProps) => {
    context.nativeProps = props;
    return React.createElement("main", null, props.children);
  },
}));
import { ChapterPager } from "../src/features/reader/ChapterPager.native";

function fixture() {
  const props: ChapterPagerProps = {
    pages: Array.from({ length: 5 }, (_, index) => ({
      bookId: "genesis",
      chapter: index + 1,
    })),
    index: 2,
    enabled: true,
    onBeforeChange: vi.fn(),
    onSelect: vi.fn(),
    renderPage: vi.fn((page) =>
      React.createElement("article", null, page.chapter),
    ),
  };
  const html = renderToStaticMarkup(React.createElement(ChapterPager, props));
  return { props, html };
}
beforeEach(() => {
  context.nativeProps = null;
});

it("uses the native pager and prepares current, previous and next chapter content", () => {
  const { props, html } = fixture();
  expect(context.nativeProps).toMatchObject({
    initialPage: 2,
    offscreenPageLimit: 1,
    overdrag: false,
  });
  expect(props.renderPage).toHaveBeenCalledTimes(3);
  expect(html.match(/<article>/g)).toHaveLength(3);
});

it("commits the settled chapter once and never navigates for a cancelled swipe", () => {
  const { props } = fixture();
  const selected = context.nativeProps?.onPageSelected;
  if (!selected) throw new Error("missing native page handler");
  const event = (position: number) =>
    ({ nativeEvent: { position } }) as Parameters<typeof selected>[0];
  selected(event(2));
  expect(props.onSelect).not.toHaveBeenCalled();
  selected(event(3));
  selected(event(3));
  expect(props.onSelect).toHaveBeenCalledOnce();
  expect(props.onSelect).toHaveBeenCalledWith({
    bookId: "genesis",
    chapter: 4,
  });
  expect(props.onBeforeChange).toHaveBeenCalledOnce();
});
