import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi, expect } from "vitest";
import type { PagerViewProps } from "react-native-pager-view";
import type {
  ChapterPagerHandle,
  ChapterPagerProps,
} from "../../src/features/reader/chapter-pager-props";

const context = vi.hoisted(() => ({
  nativeProps: null as PagerViewProps | null,
  setPage: vi.fn(),
  setPageWithoutAnimation: vi.fn(),
  cursor: 0,
  cells: [] as unknown[],
  views: 0,
  effects: [] as (() => void | (() => void))[],
  layouts: [] as (() => void | (() => void))[],
  layoutCursor: 0,
  layoutDependencies: [] as (readonly unknown[] | undefined)[],
  cleanups: [] as (() => void)[],
  dirty: false,
  handle: null as ChapterPagerHandle | null,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const i = context.cursor++;
    if (!(i in context.cells))
      context.cells[i] = typeof initial === "function" ? initial() : initial;
    return [
      context.cells[i],
      (value: unknown) => {
        const next =
          typeof value === "function" ? value(context.cells[i]) : value;
        if (!Object.is(next, context.cells[i])) {
          context.cells[i] = next;
          context.dirty = true;
        }
      },
    ];
  },
  useRef: (initial: unknown) => {
    const i = context.cursor++;
    if (!(i in context.cells)) context.cells[i] = { current: initial };
    return context.cells[i];
  },
  useEffect: (effect: () => void | (() => void)) => {
    context.effects.push(effect);
  },
  useLayoutEffect: (
    effect: () => void | (() => void),
    dependencies?: readonly unknown[],
  ) => {
    const i = context.layoutCursor++;
    const previous = context.layoutDependencies[i];
    if (
      !dependencies ||
      !previous ||
      dependencies.some((value, index) => !Object.is(value, previous[index]))
    ) {
      context.layoutDependencies[i] = dependencies;
      context.layouts.push(effect);
    }
  },
  useImperativeHandle: (_ref: unknown, create: () => ChapterPagerHandle) => {
    context.handle = create();
  },
}));
vi.mock("react-native", () => ({
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => false,
    addEventListener: () => ({ remove: vi.fn() }),
  },
  View: ({
    children,
    pointerEvents,
    importantForAccessibility,
  }: PropsWithChildren<{
    pointerEvents?: string;
    importantForAccessibility?: string;
  }>) => {
    context.views++;
    return React.createElement(
      "div",
      {
        "data-pointer": pointerEvents,
        "data-accessibility": importantForAccessibility,
      },
      children,
    );
  },
  useWindowDimensions: () => ({ width: 400, height: 850 }),
}));
vi.mock("react-native-pager-view", () => ({
  default: (props: PagerViewProps) => {
    context.nativeProps = props;
    if (props.ref && typeof props.ref === "object")
      Object.assign(props.ref, {
        current: {
          setPage: context.setPage,
          setPageWithoutAnimation: context.setPageWithoutAnimation,
        },
      });
    return React.createElement("main", null, props.children);
  },
}));
import { ChapterPager } from "../../src/features/reader/ChapterPager.native";

export function resetPager() {
  context.nativeProps = null;
  context.setPage.mockReset();
  context.setPageWithoutAnimation.mockReset();
  context.cursor = 0;
  context.cells = [];
  context.views = 0;
  context.effects = [];
  context.layouts = [];
  context.layoutCursor = 0;
  context.layoutDependencies = [];
  context.handle = null;
  context.cleanups = [];
  context.dirty = false;
}
function rootGeneration() {
  const root = context.cells[0];
  return root && typeof root === "object" && "generation" in root
    ? root.generation
    : undefined;
}
export function drawPager(props: ChapterPagerProps) {
  const previousCells = context.cells.slice();
  const previousDependencies = context.layoutDependencies.slice();
  const previousNativeProps = context.nativeProps;
  const previousHandle = context.handle;
  const previousCleanups = context.cleanups.slice();
  let generation = rootGeneration();
  let replaced = false;
  try {
    for (let attempt = 0; attempt < 5; attempt++) {
      context.cursor = 0;
      context.views = 0;
      context.layouts = [];
      context.layoutCursor = 0;
      context.dirty = false;
      const html = renderToStaticMarkup(
        React.createElement(ChapterPager, props),
      );
      if (generation === undefined) generation = rootGeneration();
      if (rootGeneration() !== generation) {
        generation = rootGeneration();
        context.cells.splice(1);
        context.layoutDependencies = [];
        replaced = true;
        continue;
      }
      if (context.dirty) continue; // React rerenders after a render-phase state update.
      if (replaced) {
        previousCleanups.forEach((cleanup) => cleanup());
        context.cleanups = [];
        replaced = false;
      }
      context.layouts.forEach((effect) => {
        const cleanup = effect();
        if (cleanup) context.cleanups.push(cleanup);
      });
      if (!context.dirty) return { html, views: context.views };
    }
    throw new Error("Pager rendering did not converge");
  } catch (error) {
    context.cells = previousCells;
    context.layoutDependencies = previousDependencies;
    context.nativeProps = previousNativeProps;
    context.handle = previousHandle;
    context.cleanups = previousCleanups;
    throw error;
  }
}

export function pagerFixture(
  index = 600,
  count = 1189,
  pages?: ChapterPagerProps["pages"],
) {
  const props: ChapterPagerProps = {
    pages:
      pages ??
      Array.from({ length: count }, (_, i) => ({
        bookId: "genesis",
        chapter: i + 1,
      })),
    index,
    enabled: true,
    onBeforeChange: vi.fn(),
    onSelect: vi.fn(),
    renderPage: vi.fn((page, current) =>
      React.createElement("article", { "data-current": current }, page.chapter),
    ),
  };
  return { props, ...drawPager(props) };
}
export function turnPage(direction: -1 | 1) {
  context.handle?.turn(direction);
}
export function nativePager() {
  expect(
    context.nativeProps,
    "Chapter paging must use the native pager",
  ).not.toBeNull();
  return context.nativeProps!;
}
export function nativeCommands() {
  return {
    animated: context.setPage,
    immediate: context.setPageWithoutAnimation,
  };
}
export function selectNative(position: number) {
  const handler = nativePager().onPageSelected;
  handler?.({ nativeEvent: { position } } as Parameters<
    NonNullable<typeof handler>
  >[0]);
}
export function nativeState(pageScrollState: "idle" | "dragging" | "settling") {
  const handler = nativePager().onPageScrollStateChanged;
  handler?.({ nativeEvent: { pageScrollState } } as Parameters<
    NonNullable<typeof handler>
  >[0]);
}
export function scrollNative(position: number, offset: number) {
  const handler = nativePager().onPageScroll;
  handler?.({ nativeEvent: { position, offset } } as Parameters<
    NonNullable<typeof handler>
  >[0]);
}
export function nativeSlots() {
  return React.Children.toArray(nativePager().children).map((slot) => {
    if (!React.isValidElement(slot))
      throw new Error("Native page must be a keyed View");
    return { key: slot.key, style: (slot.props as { style: unknown }).style };
  });
}
