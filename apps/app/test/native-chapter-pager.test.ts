import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PagerViewProps } from "react-native-pager-view";
import type {
  ChapterPagerHandle,
  ChapterPagerProps,
} from "../src/features/reader/chapter-pager-props";

const context = vi.hoisted(() => ({
  nativeProps: null as PagerViewProps | null,
  handle: null as ChapterPagerHandle | null,
}));
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useImperativeHandle: (_ref: unknown, create: () => ChapterPagerHandle) => {
    context.handle = create();
  },
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

function fixture(index = 2, count = 5) {
  const props: ChapterPagerProps = {
    pages: Array.from({ length: count }, (_, index) => ({
      bookId: "genesis",
      chapter: index + 1,
    })),
    index,
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
  context.handle = null;
});

it("prepares multiple chapters ahead before a second fast swipe can expose an empty slot", () => {
  const { props } = fixture(5, 12);
  expect(props.renderPage).toHaveBeenCalledTimes(7);
  expect(props.renderPage).toHaveBeenCalledWith(
    { bookId: "genesis", chapter: 9 },
    false,
  );
});

it("keeps global native chapter positions stable instead of recycling seven local indices", () => {
  fixture(600, 1189);
  const slots = React.Children.toArray(context.nativeProps?.children);
  expect(slots).toHaveLength(1189);
  expect(context.nativeProps?.initialPage).toBe(600);
});

it("can turn more than a preload window in either direction without resetting or locking native gestures", () => {
  const { props } = fixture(600, 1189);
  const selected = context.nativeProps?.onPageSelected;
  const changed = context.nativeProps?.onPageScrollStateChanged;
  if (!selected || !changed) throw new Error("missing native handlers");
  const select = (position: number) =>
    selected({ nativeEvent: { position } } as Parameters<typeof selected>[0]);
  const state = (pageScrollState: "dragging" | "idle") =>
    changed({ nativeEvent: { pageScrollState } } as Parameters<
      typeof changed
    >[0]);
  select(600);
  for (let position = 601; position <= 620; position++) {
    state("dragging");
    select(position);
    state("idle");
  }
  for (let position = 619; position >= 590; position--) {
    state("dragging");
    select(position);
    state("idle");
  }
  expect(props.onSelect).toHaveBeenCalledTimes(50);
  expect(props.onSelect).toHaveBeenLastCalledWith({
    bookId: "genesis",
    chapter: 591,
  });
  expect(context.nativeProps?.scrollEnabled).toBe(true);
});

it("uses matching native and text preload windows", () => {
  const { props, html } = fixture();
  expect(context.nativeProps).toMatchObject({
    initialPage: 2,
    offscreenPageLimit: 3,
    overdrag: false,
  });
  expect(props.renderPage).toHaveBeenCalledTimes(5);
  expect(html.match(/<article>/g)).toHaveLength(5);
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

it("accepts a queued reverse gesture after idle without changing its chapter mapping", () => {
  vi.useFakeTimers();
  try {
    const { props } = fixture(600, 1189);
    const selected = context.nativeProps?.onPageSelected;
    const changed = context.nativeProps?.onPageScrollStateChanged;
    if (!selected || !changed) throw new Error("missing native handlers");
    const select = (position: number) =>
      selected({ nativeEvent: { position } } as Parameters<typeof selected>[0]);
    const state = (pageScrollState: "idle" | "dragging") =>
      changed({ nativeEvent: { pageScrollState } } as Parameters<
        typeof changed
      >[0]);
    select(600);
    select(603);
    state("idle");
    state("dragging");
    select(600);
    vi.runAllTimers();
    expect(props.onSelect).toHaveBeenLastCalledWith({
      bookId: "genesis",
      chapter: 601,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("lets an arrow turn proceed immediately after idle", () => {
  vi.useFakeTimers();
  try {
    const { props } = fixture(600, 1189);
    const selected = context.nativeProps?.onPageSelected;
    const changed = context.nativeProps?.onPageScrollStateChanged;
    if (!selected || !changed || !context.handle)
      throw new Error("missing native handlers");
    const select = (position: number) =>
      selected({ nativeEvent: { position } } as Parameters<typeof selected>[0]);
    select(600);
    select(601);
    changed({ nativeEvent: { pageScrollState: "idle" } } as Parameters<
      typeof changed
    >[0]);
    vi.advanceTimersByTime(79);
    context.handle.turn(1);
    vi.advanceTimersByTime(1);
    select(602);
    expect(props.onSelect).toHaveBeenLastCalledWith({
      bookId: "genesis",
      chapter: 603,
    });
  } finally {
    vi.useRealTimers();
  }
});

it("allows the next arrow beyond the original text preload range", () => {
  const { props } = fixture(600, 1189);
  const selected = context.nativeProps?.onPageSelected;
  if (!selected || !context.handle) throw new Error("missing native handlers");
  selected({ nativeEvent: { position: 600 } } as Parameters<
    typeof selected
  >[0]);
  selected({ nativeEvent: { position: 603 } } as Parameters<
    typeof selected
  >[0]);
  vi.mocked(props.onBeforeChange).mockClear();
  context.handle.turn(1);
  expect(props.onBeforeChange).toHaveBeenCalledOnce();
});
