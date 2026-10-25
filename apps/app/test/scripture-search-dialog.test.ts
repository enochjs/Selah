import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  query: "",
  actions: [] as { label: string; onPress: () => void }[],
  input: undefined as
    undefined | { onChangeText: (query: string) => void; autoFocus: boolean },
  dialog: undefined as
    | undefined
    | {
        onDismiss: () => void;
        heightMode: string;
        presentation: string;
        keyboardAware: boolean;
      },
  scroll: undefined as undefined | { keyboardShouldPersistTaps: string },
  width: 393,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: () => [
    harness.query,
    (next: string) => {
      harness.query = next;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({ children, ...props }: PropsWithChildren) => {
    harness.scroll = props as typeof harness.scroll;
    return React.createElement("section", null, children);
  },
  TextInput: (props: typeof harness.input) => {
    harness.input = props;
    return React.createElement("input");
  },
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    harness.actions.push({ label: accessibilityLabel, onPress });
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel },
      children,
    );
  },
  useWindowDimensions: () => ({ width: harness.width }),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  Dialog: ({
    children,
    title,
    ...props
  }: PropsWithChildren<{ title: string }>) => {
    harness.dialog = props as typeof harness.dialog;
    return React.createElement("div", null, title, children);
  },
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    harness.actions.push({ label, onPress });
    return React.createElement("button", { "aria-label": label });
  },
  inputStyle: {},
}));
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
import { ScriptureSearchDialog } from "../src/features/reader/ScriptureSearchDialog";
import { bibleRepository } from "../src/data/bible-repository";
const onClose = vi.fn(),
  onOpenVerse = vi.fn();
function render(visible = true) {
  harness.actions = [];
  return renderToStaticMarkup(
    React.createElement(ScriptureSearchDialog, {
      visible,
      onClose,
      onOpenVerse,
    }),
  );
}
beforeEach(() => {
  harness.query = "";
  harness.width = 393;
  vi.clearAllMocks();
});
it("requires two characters, autofocuses, and keeps input outside the tappable result scroller", () => {
  const html = render();
  expect(html).toContain("至少输入 2 个字符");
  expect(html.indexOf("<input")).toBeLessThan(html.indexOf("<section"));
  expect(harness.input?.autoFocus).toBe(true);
  expect(harness.scroll?.keyboardShouldPersistTaps).toBe("handled");
  expect(harness.dialog).toMatchObject({
    heightMode: "large",
    presentation: "bottom",
    keyboardAware: true,
  });
});
it("keeps the query for this mounted session and labels a capped count honestly", () => {
  render();
  harness.input!.onChangeText("耶和华");
  expect(render()).toContain("40+ 处经文");
  render(false);
  expect(render()).toContain("40+ 处经文");
});
it("provides a useful zero-result state and clear action", () => {
  harness.query = "zzzzzzzzzz";
  expect(render()).toContain("没有匹配的经文，试试其他关键词");
  harness.actions.find((action) => action.label === "清空搜索")!.onPress();
  expect(render()).toContain("至少输入 2 个字符");
});
it("opens the exact result only after the dialog host dismisses", () => {
  harness.query = "世界的光";
  render();
  const result = bibleRepository.search(harness.query)[0];
  harness.actions
    .find((action) =>
      action.label.includes(`${result.chapter}:${result.verse.number}`),
    )!
    .onPress();
  expect(onClose).toHaveBeenCalledOnce();
  expect(onOpenVerse).not.toHaveBeenCalled();
  harness.dialog!.onDismiss();
  expect(onOpenVerse).toHaveBeenCalledWith(
    result.bookId,
    result.chapter,
    result.verse.number,
  );
});
it("centers the large list on desktop", () => {
  harness.width = 1200;
  render();
  expect(harness.dialog?.presentation).toBe("center");
});

it("shows an exact count for a single full-text result", () => {
  harness.query = bibleRepository
    .getChapter("john", 8)
    .find((verse) => verse.number === 12)!.zh;
  expect(render()).toContain("找到 1 处经文");
});
