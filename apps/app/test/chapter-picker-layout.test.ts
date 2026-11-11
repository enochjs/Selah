import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReadingPosition } from "../src/domain/reading";
import type { ScrollViewProps, LayoutChangeEvent } from "react-native";

const context = vi.hoisted(() => ({
  bookId: "obadiah",
  chapter: 1,
  width: 393,
  locale: "en",
  heightMode: "",
  header: null as ReactNode,
  cursor: 0,
  cells: [] as unknown[],
  actions: new Map<string, () => void>(),
  recent: [] as ReadingPosition[],
  openReadingPosition: vi.fn(),
  visible: true,
  dismiss: undefined as (() => void) | undefined,
  chapterWidths: [] as string[],
  refs: [] as { current: unknown }[],
  refCursor: 0,
  scrollProps: null as ScrollViewProps | null,
  focusLayout: undefined as ((event: LayoutChangeEvent) => void) | undefined,
  scrollTo: vi.fn(),
  dividers: [] as {
    pointerEvents?: string;
    accessible?: boolean;
    style?: object;
  }[],
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useRef: (initial: unknown) => {
    const index = context.refCursor++;
    context.refs[index] ??= { current: initial };
    return context.refs[index];
  },
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells)) context.cells[index] = initial;
    return [
      context.cells[index],
      (next: unknown) => (context.cells[index] = next),
    ];
  },
}));
function button({
  children,
  accessibilityLabel,
  label,
  active,
  onPress,
}: PropsWithChildren<{
  accessibilityLabel?: string;
  label?: string;
  active?: boolean;
  onPress?: () => void;
}>) {
  const name = accessibilityLabel ?? label;
  if (name && onPress) context.actions.set(name, onPress);
  return React.createElement(
    "button",
    { "aria-label": name, "aria-selected": active },
    children,
  );
}
vi.mock("react-native", () => {
  const element = ({
    children,
    style,
    testID,
    pointerEvents,
    accessible,
    onLayout,
  }: PropsWithChildren<{
    style?: { width?: string };
    testID?: string;
    pointerEvents?: string;
    accessible?: boolean;
    onLayout?: (event: LayoutChangeEvent) => void;
  }>) => {
    if (onLayout) context.focusLayout = onLayout;
    if (testID === "book-grid-divider")
      context.dividers.push({ pointerEvents, accessible, style });
    if (
      React.isValidElement<{ accessibilityLabel?: string }>(children) &&
      children.props.accessibilityLabel?.startsWith("1 Kings ") &&
      style?.width
    )
      context.chapterWidths.push(style.width);
    return React.createElement("div", null, children);
  };
  return {
    View: element,
    Pressable: button,
    ScrollView: ({
      ref,
      ...props
    }: PropsWithChildren<
      ScrollViewProps & { ref?: React.RefObject<unknown> }
    >) => {
      context.scrollProps = props;
      if (ref) ref.current = { scrollTo: context.scrollTo };
      return React.createElement("div", null, props.children);
    },
    TextInput: () => null,
    useWindowDimensions: () => ({ width: context.width, height: 852 }),
  };
});
vi.mock("react-native-safe-area-context", () => ({
  SafeAreaView: ({ children }: PropsWithChildren) => children,
}));
vi.mock("lucide-react-native", () => ({
  Check: () => null,
  Headphones: () => React.createElement("i", { "data-icon": "headphones" }),
  ChevronLeft: () => null,
  ChevronRight: () => null,
  History: () => null,
  X: () => null,
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13, body: 14 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({
    locale: context.locale,
    bi: (zh: string, en: string) => (context.locale === "zh" ? zh : en),
  }),
}));
vi.mock("../src/shared/ui", () => {
  const element = ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children);
  return {
    Txt: element,
    Pill: element,
    IconButton: button,
    inputStyle: {},
    Dialog: ({
      children,
      heightMode,
      header,
      visible,
      onDismiss,
    }: PropsWithChildren<{
      heightMode: string;
      header: ReactNode | ((controls: object) => ReactNode);
      visible: boolean;
      onDismiss: () => void;
    }>) => {
      context.visible = visible;
      context.dismiss = onDismiss;
      context.heightMode = heightMode;
      context.header =
        typeof header === "function"
          ? header({ onClose: () => {}, dismissible: true })
          : header;
      return React.createElement("section", null, context.header, children);
    },
  };
});
vi.mock("../src/state/app-store", () => ({
  useAppStore: Object.assign(
    (select: (state: object) => unknown) =>
      select({
        bookId: context.bookId,
        chapter: context.chapter,
        recentReadings: context.recent,
      }),
    {
      getState: () => ({ openReadingPosition: context.openReadingPosition }),
    },
  ),
}));
vi.mock("../src/data/audio-repository", () => ({
  hasChapterAudio: () => true,
}));
import { ChapterPicker } from "../src/features/reader/ChapterPicker";
beforeEach(() => {
  context.bookId = "obadiah";
  context.chapter = 1;
  context.width = 393;
  context.locale = "en";
  context.cursor = 0;
  context.cells = [];
  context.actions.clear();
  context.recent = [];
  context.openReadingPosition.mockReset();
  context.chapterWidths = [];
  context.refs = [];
  context.refCursor = 0;
  context.scrollProps = null;
  context.focusLayout = undefined;
  context.scrollTo.mockReset();
  context.dividers = [];
});
function draw(props: Partial<React.ComponentProps<typeof ChapterPicker>> = {}) {
  context.cursor = 0;
  context.refCursor = 0;
  context.actions.clear();
  return renderToStaticMarkup(
    React.createElement(ChapterPicker, {
      visible: true,
      onClose: () => {},
      ...props,
    }),
  );
}
it("restores each testament's scroll offset instead of re-centering the current book", () => {
  context.bookId = "psalms";
  const props = { initialView: "books" as const };
  const layout = (y: number) =>
    ({
      nativeEvent: { layout: { x: 0, y, width: 393, height: 600 } },
    }) as LayoutChangeEvent;
  function size() {
    context.scrollProps?.onLayout?.(layout(0));
    context.scrollProps?.onContentSizeChange?.(393, 1000);
    context.focusLayout?.(layout(400));
  }
  function scroll(y: number) {
    context.scrollProps?.onScroll?.({
      nativeEvent: { contentOffset: { x: 0, y } },
    } as Parameters<NonNullable<ScrollViewProps["onScroll"]>>[0]);
  }
  function switchTab(label: string) {
    context.actions.get(label)!();
    // The keyed list remounts; the dialog's own refs remain mounted.
    context.refs.length = 1;
    context.focusLayout = undefined;
    context.scrollTo.mockClear();
    draw(props);
    size();
  }
  draw(props);
  size();
  expect(context.scrollTo).toHaveBeenLastCalledWith({
    y: 200,
    animated: false,
  });
  scroll(0);
  switchTab("New Testament · 27");
  expect(context.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  scroll(120);
  switchTab("Old Testament · 39");
  expect(context.scrollTo).toHaveBeenLastCalledWith({ y: 0, animated: false });
  scroll(80);
  switchTab("New Testament · 27");
  expect(context.scrollTo).toHaveBeenLastCalledWith({
    y: 120,
    animated: false,
  });
});
it.each([
  [393, 30],
  [320, 26],
  [1100, 0],
])(
  "renders native vertical grid dividers without blocking touches at %spx",
  (width, count) => {
    context.width = width;
    context.locale = "zh";
    draw({ initialView: "books" });
    expect(context.dividers).toHaveLength(count);
    for (const divider of context.dividers) {
      expect(divider.pointerEvents).toBe("none");
      expect(divider.accessible).toBe(false);
      expect(divider.style).toMatchObject({
        position: "absolute",
        top: 0,
        bottom: 0,
        right: 0,
        width: 1,
      });
    }
  },
);
it.each([
  ["zh", "1-kings", "列王纪上", "王上"],
  ["zh", "ezra", "以斯拉记", "拉"],
  ["zh", "1-thessalonians", "帖撒罗尼迦前书", "帖前"],
  ["en", "1-kings", "1 Kings", "1 Kgs"],
  ["en", "1-thessalonians", "1 Thessalonians", "1 Thess"],
])(
  "shows %s book abbreviations above full names for %s and opens its chapters",
  (locale, bookId, fullName, shortName) => {
    context.locale = locale;
    context.bookId = bookId;
    const html = draw({ initialView: "books" });
    const label = fullName.replace(/^([1-3]) /, "$1\u00a0");
    expect(html).toContain(`<span>${shortName}</span><span>${label}</span>`);
    context.actions.get(fullName)!();
    expect(draw({ initialView: "books" })).toContain(
      `aria-label="${fullName} 1"`,
    );
  },
);
it("keeps the desktop book list detailed without a duplicate abbreviation", () => {
  context.width = 1100;
  context.bookId = "1-kings";
  const html = draw({ initialView: "books" });
  expect(html).toContain("撒母耳记上");
  expect(html).not.toContain("<span>1 Sam</span>");
});
it.each([320, 393, 430, 800, 1100])(
  "fills complete chapter rows evenly and keeps the last row aligned at %spx",
  (width) => {
    context.width = width;
    context.bookId = "1-kings";
    draw();
    expect(context.chapterWidths).toHaveLength(22);
    const cellWidth = parseFloat(context.chapterWidths[0]);
    const columns = Math.round(100 / cellWidth);
    expect(cellWidth * columns).toBeCloseTo(100);
    expect(new Set(context.chapterWidths).size).toBe(1);
  },
);
it("shows chapter numbers without audio icons and still navigates", () => {
  context.bookId = "1-kings";
  expect(draw()).not.toContain('data-icon="headphones"');
  context.actions.get("1 Kings 2")!();
  expect(context.openReadingPosition).toHaveBeenCalledExactlyOnceWith({
    bookId: "1-kings",
    chapter: 2,
    verse: 1,
    offset: 0,
  });
});
it("fits a single chapter to content and moves the book return control into the header", () => {
  const html = renderToStaticMarkup(
    React.createElement(ChapterPicker, { visible: true, onClose: () => {} }),
  );
  expect(context.heightMode).toBe("content");
  expect(
    renderToStaticMarkup(
      React.createElement(React.Fragment, null, context.header),
    ),
  ).toContain("Obadiah");
  expect(html).not.toContain("All books</span>");
});
it("gives the full book list and Psalms a large independently scrolling panel", () => {
  renderToStaticMarkup(
    React.createElement(ChapterPicker, {
      visible: true,
      initialView: "books",
      onClose: () => {},
    }),
  );
  expect(context.heightMode).toBe("large");
  context.cells = [];
  context.cursor = 0;
  context.bookId = "psalms";
  context.chapter = 150;
  renderToStaticMarkup(
    React.createElement(ChapterPicker, { visible: true, onClose: () => {} }),
  );
  expect(context.heightMode).toBe("large");
});

it.each([393, 1100])(
  "keeps recent positions behind a header history icon at %spx",
  (width) => {
    context.width = width;
    context.recent = [{ bookId: "psalms", chapter: 25, verse: 1, offset: 24 }];
    const html = draw({ initialView: "books" });
    expect(html).toContain('aria-label="Reading history"');
    expect(html).not.toContain('aria-label="Return to Psalms 25:1"');
    context.actions.get("Reading history")!();
    const history = draw({ initialView: "books" });
    expect(history).toContain('aria-label="Return to Psalms 25:1"');
    expect(history).not.toContain("Old Testament");
    expect(context.visible).toBe(true);
    context.actions.get("All books")!();
    expect(draw({ initialView: "books" })).toContain("Old Testament");
  },
);

it("returns from history to the chapter grid without losing the selected book", () => {
  context.bookId = "psalms";
  context.chapter = 25;
  draw();
  context.actions.get("Reading history")!();
  expect(draw()).toContain("No reading history yet");
  context.actions.get("Back to chapters")!();
  expect(draw()).toContain('aria-label="Psalms 25"');
  context.actions.get("Reading history")!();
  draw();
  context.actions.get("Reading history")!();
  expect(draw()).toContain('aria-label="Psalms 25"');
});

it("restores the saved verse and offset and dismisses history after navigation", () => {
  const position = { bookId: "psalms", chapter: 24, verse: 6, offset: 37 };
  context.recent = [position];
  const onBeforeNavigate = vi.fn();
  const onClose = vi.fn();
  const props = { onBeforeNavigate, onClose };
  draw(props);
  context.actions.get("Reading history")!();
  draw(props);
  context.actions.get("Return to Psalms 24:6")!();
  expect(context.openReadingPosition).toHaveBeenCalledExactlyOnceWith(position);
  expect(onBeforeNavigate.mock.invocationCallOrder[0]).toBeLessThan(
    context.openReadingPosition.mock.invocationCallOrder[0],
  );
  draw(props);
  expect(context.visible).toBe(false);
  expect(onClose).not.toHaveBeenCalled();
  context.dismiss?.();
  expect(onClose).toHaveBeenCalledOnce();
});
