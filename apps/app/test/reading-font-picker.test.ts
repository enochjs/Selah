import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const actions = new Map<string, () => void>();
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
    "aria-checked": checked,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
    "aria-checked": boolean;
  }>) => {
    actions.set(accessibilityLabel, onPress);
    return React.createElement(
      "button",
      { "aria-label": accessibilityLabel, "aria-checked": checked },
      children,
    );
  },
}));
vi.mock("lucide-react-native", () => ({ Check: () => null }));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: { scriptureZh: "serif", scriptureEn: "serif" },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
// Server rendering deliberately uses Zustand's initial snapshot. Read the current
// store here so repeated renders exercise the same selections as the client.
vi.mock("../src/state/app-store", async (original) => {
  const actual = await original<typeof import("../src/state/app-store")>();
  const store = actual.useAppStore;
  return {
    useAppStore: Object.assign(
      (select: (state: ReturnType<typeof store.getState>) => unknown) =>
        select(store.getState()),
      store,
    ),
  };
});
import { useAppStore } from "../src/state/app-store";
import { ReadingFontPicker } from "../src/features/settings/ReadingFontPicker";

beforeEach(() => {
  actions.clear();
  useAppStore.setState(useAppStore.getInitialState(), true);
});

it("lets readers select Chinese and English fonts independently with accessible selected states", () => {
  const render = () =>
    renderToStaticMarkup(
      React.createElement(
        React.Fragment,
        null,
        React.createElement(ReadingFontPicker, { language: "zh" }),
        React.createElement(ReadingFontPicker, { language: "en" }),
      ),
    );
  expect(render()).toContain("霞鹜文楷");
  actions.get("中文字体 · 霞鹜文楷")!();
  actions.get("英文字体 · DM Sans")!();
  expect(useAppStore.getState().readingFonts).toEqual({
    zh: "lxgw-wenkai",
    en: "dm-sans",
  });
  expect(render()).toContain(
    'aria-label="中文字体 · 霞鹜文楷" aria-checked="true"',
  );
  expect(render()).toContain(
    'aria-label="英文字体 · DM Sans" aria-checked="true"',
  );
  useAppStore.getState().setLocale("en");
  expect(render()).toContain("Noto Sans SC");
  actions.get("Chinese font · System")!();
  expect(useAppStore.getState().readingFonts).toEqual({
    zh: "system",
    en: "dm-sans",
  });
});
