import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const ui = vi.hoisted(() => ({
  english: false,
  change: vi.fn(),
  actions: [] as { label: string; hint: string; press: () => void }[],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    accessibilityHint,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    accessibilityHint: string;
    onPress: () => void;
  }>) => {
    ui.actions.push({
      label: accessibilityLabel,
      hint: accessibilityHint,
      press: onPress,
    });
    return React.createElement("button", null, children);
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    ["ListEnd", "Repeat1", "Repeat"].map((name) => [
      name,
      () => React.createElement("svg", { "data-icon": name }),
    ]),
  ),
);
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string, en: string) => (ui.english ? en : zh) }),
}));
vi.mock("../src/shared/theme", () => ({ colors: {} }));
import { HymnRepeatButton } from "../src/features/audio/HymnRepeatControl";

beforeEach(() => {
  vi.clearAllMocks();
  ui.english = false;
  ui.actions = [];
});

it.each([
  ["off", "顺序播放", "ListEnd", "verse", "单曲循环"],
  ["verse", "单曲循环", "Repeat1", "chapter", "列表循环"],
  ["chapter", "列表循环", "Repeat", "off", "顺序播放"],
] as const)(
  "cycles %s directly while explaining the next mode",
  (repeat, label, icon, next, nextLabel) => {
    const html = renderToStaticMarkup(
      React.createElement(HymnRepeatButton, { repeat, onChange: ui.change }),
    );
    expect(html).toContain(label);
    expect(html).toContain(`data-icon="${icon}"`);
    expect(ui.change).not.toHaveBeenCalled();
    expect(ui.actions).toHaveLength(1);
    expect(ui.actions[0].label).toBe(`循环方式：${label}`);
    expect(ui.actions[0].hint).toBe(`点击切换为${nextLabel}`);
    ui.actions[0].press();
    expect(ui.change).toHaveBeenCalledExactlyOnceWith(next);
  },
);

it.each([
  ["off", "In order", "Repeat one"],
  ["verse", "Repeat one", "Repeat all"],
  ["chapter", "Repeat all", "In order"],
] as const)(
  "names the current and next mode in English for %s",
  (repeat, label, next) => {
    ui.english = true;
    const html = renderToStaticMarkup(
      React.createElement(HymnRepeatButton, { repeat, onChange: ui.change }),
    );
    expect(html).toContain(label);
    expect(ui.actions[0].label).toBe(`Repeat mode: ${label}`);
    expect(ui.actions[0].hint).toBe(`Switch to ${next}`);
  },
);
