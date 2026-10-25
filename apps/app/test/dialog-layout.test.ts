import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const context = vi.hoisted(() => ({
  conflictingStyles: [] as object[],
  actions: new Map<string, { press: () => void; disabled?: boolean }>(),
}));
vi.mock("react-native", () => {
  function flatten(value: unknown): object {
    return Array.isArray(value)
      ? Object.assign({}, ...value.map(flatten))
      : (value ?? {});
  }
  const element = ({
    children,
    style,
    testID,
  }: PropsWithChildren<{ style?: unknown; testID?: string }>) => {
    const resolved = flatten(style);
    if (
      "flex" in resolved &&
      ("flexGrow" in resolved ||
        "flexShrink" in resolved ||
        "flexBasis" in resolved)
    )
      context.conflictingStyles.push(resolved);
    return React.createElement(
      "div",
      { style: resolved, "data-testid": testID },
      children,
    );
  };
  return {
    View: element,
    Text: element,
    ScrollView: ({ children }: PropsWithChildren) =>
      React.createElement("main", null, children),
    KeyboardAvoidingView: element,
    Pressable: ({
      children,
      accessibilityLabel,
      onPress,
      disabled,
      style,
    }: PropsWithChildren<{
      accessibilityLabel: string;
      onPress: () => void;
      disabled?: boolean;
      style?: unknown;
    }>) => {
      context.actions.set(accessibilityLabel, { press: onPress, disabled });
      return React.createElement(
        "button",
        {
          disabled,
          "aria-label": accessibilityLabel,
          style: flatten(typeof style === "function" ? style({}) : style),
        },
        children,
      );
    },
    Modal: ({
      children,
      onRequestClose,
    }: PropsWithChildren<{ onRequestClose: () => void }>) => {
      context.actions.set("system", { press: onRequestClose });
      return React.createElement("section", null, children);
    },
    Platform: { OS: "android" },
    Animated: { View: element },
    StyleSheet: {
      create: (value: unknown) => value,
      flatten,
      absoluteFill: {},
    },
  };
});
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (_zh: string, en: string) => en }),
}));
vi.mock("../src/shared/use-dialog-motion", () => ({
  useDialogMotion: () => ({ modalVisible: true }),
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13, body: 14 },
}));
import { Dialog } from "../src/shared/ui";

beforeEach(() => {
  context.actions.clear();
  context.conflictingStyles = [];
});
it("lets a short non-scrolling confirmation take its content height", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Dialog,
      { visible: true, onClose: vi.fn(), title: "Confirm", scrollable: false },
      "Short confirmation",
    ),
  );
  expect(html).not.toContain("height:82%");
  expect(html).toContain("Short confirmation");
});
it("keeps the fixed header and footer outside the scrolling body", () => {
  const html = renderToStaticMarkup(
    React.createElement(
      Dialog,
      {
        visible: true,
        onClose: vi.fn(),
        title: "Fixed heading",
        footer: React.createElement("footer", null, "Save"),
      },
      "Long body",
    ),
  );
  expect(html).toMatch(
    /Fixed heading[\s\S]*<main>Long body<\/main>[\s\S]*<footer>Save<\/footer>/,
  );
});
it("blocks backdrop, close button and system dismissal with disabled close semantics", () => {
  const close = vi.fn();
  renderToStaticMarkup(
    React.createElement(Dialog, {
      visible: true,
      onClose: close,
      title: "Saving",
      dismissible: false,
    }),
  );
  for (const action of context.actions.values()) action.press();
  expect(close).not.toHaveBeenCalled();
  expect(context.actions.get("Close")?.disabled).toBe(true);
});
it("supplies the guarded dismissal to a custom header", () => {
  const close = vi.fn();
  renderToStaticMarkup(
    React.createElement(Dialog, {
      visible: true,
      onClose: close,
      title: "Saving",
      dismissible: false,
      header: ({ onClose, dismissible }) => {
        onClose();
        return React.createElement("span", null, String(dismissible));
      },
    }),
  );
  expect(close).not.toHaveBeenCalled();
});

it("can switch large panels to content without conflicting flex shorthands", () => {
  for (const heightMode of ["large", "content"] as const)
    renderToStaticMarkup(
      React.createElement(
        Dialog,
        {
          visible: true,
          onClose: vi.fn(),
          title: "Chapters",
          scrollable: false,
          heightMode,
        },
        "Body",
      ),
    );
  expect(context.conflictingStyles).toEqual([]);
});
