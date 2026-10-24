import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  TextInput: () =>
    React.createElement("textarea", { "aria-label": "Personal note" }),
  Pressable: ({ children }: PropsWithChildren) =>
    React.createElement("button", null, children),
  useWindowDimensions: () => ({ width: 393, height: 852 }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
vi.mock("lucide-react-native", () => ({
  Plus: () => null,
  Check: () => null,
  BookOpen: () => null,
  X: () => null,
  ChevronDown: () => null,
  ChevronUp: () => null,
  Info: () => null,
  PencilLine: () => null,
}));
vi.mock("../src/shared/theme", () => ({
  colors: {
    bg: "#F8F7F3",
    paper: "#fff",
    muted: "#818378",
    green: "#4C6244",
    darkGreen: "#33472F",
    border: "#E8E8DF",
  },
  fonts: { serif: "serif", regular: "sans-serif", medium: "sans-serif" },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (_zh: string, en: string) => en }),
}));
vi.mock("../src/state/app-store", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/state/app-store")>();
  const store = actual.useAppStore;
  return {
    useAppStore: Object.assign(
      (selector: (state: ReturnType<typeof store.getState>) => unknown) =>
        selector(store.getState()),
      store,
    ),
  };
});
vi.mock("../src/shared/ui", () => ({
  Txt: ({
    children,
    numberOfLines,
  }: PropsWithChildren<{ numberOfLines?: number }>) =>
    React.createElement("span", { "data-max-lines": numberOfLines }, children),
  Eyebrow: ({ children }: PropsWithChildren) =>
    React.createElement("small", null, children),
  IconButton: ({ label }: { label: string }) =>
    React.createElement("button", null, label),
  Button: ({ children }: PropsWithChildren) =>
    React.createElement("button", null, children),
  Dialog: ({
    children,
    title,
    header,
    footer,
    presentation,
  }: PropsWithChildren<{
    title: string;
    header?: ReactNode;
    footer?: ReactNode;
    presentation: string;
  }>) =>
    React.createElement(
      "section",
      { "data-presentation": presentation },
      header ?? React.createElement("h1", null, title),
      React.createElement("main", null, children),
      React.createElement("footer", null, footer),
    ),
  inputStyle: {},
}));
vi.mock("../src/features/vocabulary/WordPronunciationButton", () => ({
  WordPronunciationButton: () =>
    React.createElement("button", null, "Pronounce"),
}));
vi.mock("../src/features/vocabulary/useWordLookup", () => ({
  useWordLookup: () => ({
    entry: {
      word: "family",
      lemma: "family",
      phonetic: "/ˈfæməli/",
      type: "noun",
      meaning: "家庭；家人",
      source: "ECDICT",
      language: "zh",
    },
    status: "found",
    retry: () => {},
  }),
}));
import { useAppStore } from "../src/state/app-store";
import { WordDialog } from "../src/features/vocabulary/WordDialog";

beforeEach(() => useAppStore.setState(useAppStore.getInitialState(), true));
function render() {
  return renderToStaticMarkup(
    React.createElement(WordDialog, {
      selection: {
        word: "family",
        context: "Each with his family.",
        reference: "Exodus 1:1",
      },
      onClose: () => {},
    }),
  );
}
it("opens lookup as a mobile sheet with a persistent save action and an optional collapsed note", () => {
  const html = render();
  expect(html).toContain('data-presentation="bottom"');
  expect(html).toMatch(/<footer>[\s\S]*Add to vocabulary[\s\S]*<\/footer>/);
  expect(html).toContain("Add note");
  expect(html).not.toContain("textarea");
  expect(html).not.toContain("WORD BY WORD");
  expect(html).not.toContain("MIT License");
});
it("keeps a saved note intact when opening an already saved word", () => {
  useAppStore
    .getState()
    .addWord("family", "我的旧释义", "", "", "Keep my note");
  const html = render();
  expect(html).toContain("Edit note");
  expect(html).toContain("Done");
  expect(html).not.toContain("textarea");
  expect(useAppStore.getState().words[0]).toMatchObject({
    meaning: "我的旧释义",
    note: "Keep my note",
  });
});
it("never clips a passage without offering a way to read its full text", () => {
  const html = render();
  expect(html).not.toContain('data-max-lines="2">Each with his family.');
});
