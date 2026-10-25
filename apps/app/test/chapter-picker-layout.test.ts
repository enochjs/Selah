import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  bookId: "obadiah",
  chapter: 1,
  width: 393,
  heightMode: "",
  header: null as ReactNode,
}));
vi.mock("react-native", () => {
  const element = ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children);
  return {
    View: element,
    Pressable: element,
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
  Headphones: () => null,
  ChevronLeft: () => null,
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
    IconButton: () => null,
    inputStyle: {},
    Dialog: ({
      children,
      heightMode,
      header,
    }: PropsWithChildren<{
      heightMode: string;
      header: ReactNode | ((controls: object) => ReactNode);
    }>) => {
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
  useAppStore: (select: (state: object) => unknown) =>
    select({
      bookId: context.bookId,
      chapter: context.chapter,
      recentReadings: [],
    }),
}));
vi.mock("../src/data/audio-repository", () => ({
  hasChapterAudio: () => false,
}));
import { ChapterPicker } from "../src/features/reader/ChapterPicker";
beforeEach(() => {
  context.bookId = "obadiah";
  context.chapter = 1;
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
  context.bookId = "psalms";
  context.chapter = 150;
  renderToStaticMarkup(
    React.createElement(ChapterPicker, { visible: true, onClose: () => {} }),
  );
  expect(context.heightMode).toBe("large");
});
