import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReadingPosition } from "../src/domain/reading";

const context = vi.hoisted(() => ({
  bookId: "obadiah",
  chapter: 1,
  width: 393,
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
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
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
  }: PropsWithChildren<{ style?: { width?: string } }>) => {
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
    ScrollView: element,
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
  useI18n: () => ({ bi: (_zh: string, en: string) => en }),
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
  context.cursor = 0;
  context.cells = [];
  context.actions.clear();
  context.recent = [];
  context.openReadingPosition.mockReset();
  context.chapterWidths = [];
});
function draw(props: Partial<React.ComponentProps<typeof ChapterPicker>> = {}) {
  context.cursor = 0;
  context.actions.clear();
  return renderToStaticMarkup(
    React.createElement(ChapterPicker, {
      visible: true,
      onClose: () => {},
      ...props,
    }),
  );
}
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
