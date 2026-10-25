import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  bookmarks: [] as string[],
  actions: [] as { role?: string; label: string; onPress: () => void }[],
  dialog: undefined as
    undefined | { onDismiss: () => void; heightMode: string },
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ScrollView: ({ children }: PropsWithChildren) =>
    React.createElement("section", null, children),
  Pressable: ({
    children,
    accessibilityRole,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityRole: string;
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    harness.actions.push({
      role: accessibilityRole,
      label: accessibilityLabel,
      onPress,
    });
    return React.createElement("button", null, children);
  },
  useWindowDimensions: () => ({ width: 393 }),
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
  Button: ({
    children,
    onPress,
  }: PropsWithChildren<{ onPress: () => void }>) => {
    harness.actions.push({ label: String(children), onPress });
    return React.createElement("button", null, children);
  },
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13 },
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh, locale: "zh" }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (select: (state: { bookmarks: string[] }) => unknown) =>
    select(harness),
}));
import { SavedVersesDialog } from "../src/features/reader/SavedVersesDialog";
import { bibleRepository } from "../src/data/bible-repository";
const onClose = vi.fn(),
  onOpenVerse = vi.fn(),
  onOpenReader = vi.fn();
function render() {
  harness.actions = [];
  return renderToStaticMarkup(
    React.createElement(SavedVersesDialog, {
      visible: true,
      onClose,
      onOpenVerse,
      onOpenReader,
    }),
  );
}
beforeEach(() => {
  harness.bookmarks = [];
  vi.clearAllMocks();
});
it("offers reading with a natural-height empty state after dismissal", () => {
  expect(render()).toContain("珍藏的经文 · 0");
  expect(harness.dialog?.heightMode).toBe("content");
  harness.actions.find((action) => action.label === "去读经")!.onPress();
  expect(onClose).toHaveBeenCalledOnce();
  expect(onOpenReader).not.toHaveBeenCalled();
  harness.dialog!.onDismiss();
  expect(onOpenReader).toHaveBeenCalledOnce();
});
it.each([1, 100])(
  "renders %s saved verses with count and accessible exact navigation",
  (count) => {
    harness.bookmarks = bibleRepository
      .getChapter("psalms", 119)
      .slice(0, count)
      .map((verse) => `psalms:119:${verse.number}`);
    const html = render();
    expect(html).toContain(`珍藏的经文 · ${count}`);
    expect(harness.dialog?.heightMode).toBe("large");
    expect(
      harness.actions.filter((action) => action.role === "button"),
    ).toHaveLength(count);
    harness.actions
      .find((action) => action.label.includes(`119:${count}`))!
      .onPress();
    expect(onOpenVerse).not.toHaveBeenCalled();
    harness.dialog!.onDismiss();
    expect(onOpenVerse).toHaveBeenCalledWith("psalms", 119, count);
  },
);
