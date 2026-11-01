import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PagerViewProps } from "react-native-pager-view";
import type { ChapterPagerProps } from "../src/features/reader/chapter-pager-props";
import { chapterPages } from "../src/features/reader/chapter-pagination";
import { bibleRepository } from "../src/data/bible-repository";

const context = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  nativeProps: null as PagerViewProps | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells))
      context.cells[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      context.cells[index],
      (value: unknown) => {
        context.cells[index] =
          typeof value === "function" ? value(context.cells[index]) : value;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells)) context.cells[index] = { current: initial };
    return context.cells[index];
  },
  useEffect: () => {},
  useImperativeHandle: () => {},
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("react-native-pager-view", () => ({
  default: (props: PagerViewProps) => {
    context.nativeProps = props;
    return null;
  },
}));
import { ChapterPager } from "../src/features/reader/ChapterPager.native";

const pages = chapterPages(bibleRepository.listBooks());
const psalms = pages.findIndex(
  (page) => page.bookId === "psalms" && page.chapter === 1,
);

function draw(props: ChapterPagerProps) {
  context.cursor = 0;
  renderToStaticMarkup(React.createElement(ChapterPager, props));
  // Commit a render-phase generation update, as React does before mounting.
  context.cursor = 0;
  renderToStaticMarkup(React.createElement(ChapterPager, props));
  if (!context.nativeProps) throw new Error("missing native pager");
  return context.nativeProps;
}
function select(props: PagerViewProps, position: number) {
  props.onPageSelected?.({ nativeEvent: { position } } as Parameters<
    NonNullable<PagerViewProps["onPageSelected"]>
  >[0]);
}
function drag(props: PagerViewProps) {
  props.onPageScrollStateChanged?.({
    nativeEvent: { pageScrollState: "dragging" },
  } as Parameters<NonNullable<PagerViewProps["onPageScrollStateChanged"]>>[0]);
}
beforeEach(() => {
  context.cursor = 0;
  context.cells = [];
  context.nativeProps = null;
});

it.each([
  { timing: "before", dragging: false },
  { timing: "before", dragging: true },
  { timing: "after", dragging: false },
  { timing: "after", dragging: true },
])(
  "keeps Genesis selected when old Psalms events arrive $timing settling (dragging=$dragging)",
  ({ timing, dragging }) => {
    const props: ChapterPagerProps = {
      pages,
      index: psalms + 22,
      enabled: true,
      onBeforeChange: vi.fn(),
      onSelect: vi.fn(),
      renderPage: () => null,
    };
    const oldPager = draw(props);
    select(oldPager, props.index);
    const newPager = draw({ ...props, index: 0 });
    expect(newPager.initialPage).toBe(0);
    if (timing === "after") select(newPager, 0);
    // Queued native callbacks from the replaced view must not restore Psalms 1.
    if (dragging) drag(oldPager);
    select(oldPager, psalms);
    if (timing === "before") select(newPager, 0);
    expect(props.onSelect).not.toHaveBeenCalled();
    expect(props.onBeforeChange).not.toHaveBeenCalled();
    drag(newPager);
    select(newPager, 1);
    expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
      bookId: "genesis",
      chapter: 2,
    });
  },
);
