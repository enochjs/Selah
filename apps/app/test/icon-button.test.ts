import React, { type PropsWithChildren } from "react";
import type { LucideProps } from "lucide-react-native";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

const targets = vi.hoisted(() => ({
  items: [] as {
    role?: string;
    label?: string;
    minHeight?: number;
    minWidth?: number;
    onPress?: () => void;
  }[],
}));
vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style: object }>) =>
    React.createElement("div", { style }, children),
  Text: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  Pressable: ({
    children,
    style,
    accessibilityState,
    accessibilityRole,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    style: (interaction: {
      hovered: boolean;
      pressed: boolean;
    }) => object | object[];
    accessibilityState?: { selected?: boolean; disabled?: boolean };
    accessibilityRole?: string;
    accessibilityLabel?: string;
    onPress?: () => void;
  }>) => {
    const value = style({ hovered: false, pressed: false });
    const resolved = Object.assign(
      {},
      ...(Array.isArray(value) ? value : [value]),
    ) as { minHeight?: number; minWidth?: number };
    targets.items.push({
      role: accessibilityRole,
      label: accessibilityLabel,
      minHeight: resolved.minHeight,
      minWidth: resolved.minWidth,
      onPress,
    });
    return React.createElement(
      "button",
      {
        style: resolved,
        disabled: accessibilityState?.disabled,
        "aria-pressed": accessibilityState?.selected,
      },
      children,
    );
  },
  StyleSheet: {
    create: (styles: object) => styles,
    flatten: (style: object) => style,
  },
}));
vi.mock("lucide-react-native", () => ({
  X: () => null,
  BookMarked: () => null,
  CalendarDays: () => null,
}));
vi.mock("expo-router", () => ({ router: { replace: vi.fn() } }));
vi.mock("../src/shared/theme", () => ({
  typeScale: { caption: 12, label: 13, body: 14 },
  colors: {
    green: "#4C6244",
    lightGreen: "#EAF0E3",
    paper: "#FFFFFF",
    muted: "#818378",
  },
  fonts: {},
}));
vi.mock("../src/shared/use-dialog-motion", () => ({
  useDialogMotion: () => ({}),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (_zh: string, en: string) => en }),
}));
vi.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
import { Button, IconButton, Pill } from "../src/shared/ui";

import { VocabularyTabs } from "../src/features/vocabulary/VocabularyTabs";
import { router } from "expo-router";

const Icon = React.forwardRef<SVGSVGElement, LucideProps>(
  ({ color, fill, size }, ref) =>
    React.createElement("svg", {
      stroke: color,
      fill,
      width: size,
      height: size,
      ref,
    }),
);
it("shows active toolbar controls as green icons without a background", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Loop verse",
      active: true,
      onPress: () => {},
    }),
  );
  expect(html).toContain("background-color:transparent");
  expect(html).toContain('stroke="#4C6244"');
  expect(html).toContain('aria-pressed="true"');
});
it("leaves inactive controls transparent and outlined", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Loop verse",
      onPress: () => {},
    }),
  );
  expect(html).toContain("background-color:transparent");
  expect(html).toContain('stroke="#818378"');
  expect(html).toContain('fill="none"');
});

it("uses a solid green icon for saved bookmarks", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Saved verse",
      active: true,
      fillActive: true,
      onPress: () => {},
    }),
  );
  expect(html).toContain('fill="#4C6244"');
});

it.each([false, true])(
  "keeps favorite icons unboxed with selected=%s",
  (active) => {
    targets.items = [];
    const press = vi.fn();
    const html = renderToStaticMarkup(
      React.createElement(IconButton, {
        icon: Icon,
        label: active ? "Unfavorite hymn" : "Favorite hymn",
        active,
        activeStyle: "icon",
        fillActive: true,
        onPress: press,
      }),
    );
    expect(html).toContain("background-color:transparent");
    expect(html).toContain(`stroke="${active ? "#4C6244" : "#818378"}"`);
    expect(html).toContain(`fill="${active ? "#4C6244" : "none"}"`);
    expect(html).toContain('width="19" height="19"');
    expect(html).toContain(`aria-pressed="${active}"`);
    expect(targets.items[0].minHeight).toBeGreaterThanOrEqual(44);
    expect(targets.items[0].minWidth).toBeGreaterThanOrEqual(44);
    targets.items[0].onPress!();
    expect(press).toHaveBeenCalledOnce();
  },
);

it("gives inactive verse actions the same visible circular surface as active actions", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Play verse",
      visualSize: 28,
      activeStyle: "surface",
      size: 16,
      onPress: () => {},
    }),
  );
  expect(html).toMatch(
    /<div style="width:28px;height:28px;[^"]*background-color:#EAF0E3/,
  );
});

it("keeps a 44px touch target despite a smaller external style and visual badge", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Loop verse",
      active: true,
      visualSize: 20,
      activeStyle: "surface",
      size: 12,
      style: { width: 28, height: 26 },
      onPress: () => {},
    }),
  );
  expect(html).toMatch(
    /<button style="width:44px;height:44px;[^"]*background-color:transparent/,
  );
  expect(html).toMatch(
    /<div style="width:20px;height:20px;[^"]*background-color:#4C6244/,
  );
  expect(html).toContain('width="12" height="12"');
});

it("exposes disabled controls without losing their target", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Unavailable",
      disabled: true,
      onPress: () => {},
    }),
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain("width:44px;height:44px");
});

it("allows compact reading actions to use a 32px height while retaining their width and press handler", () => {
  targets.items = [];
  const press = vi.fn();
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Bookmark verse",
      compact: true,
      visualSize: 28,
      size: 16,
      onPress: press,
    }),
  );
  expect(html).toContain("width:44px;height:32px");
  expect(targets.items[0].minWidth).toBe(44);
  expect(targets.items[0].minHeight).toBe(32);
  targets.items[0].onPress!();
  expect(press).toHaveBeenCalledOnce();
});

it("keeps small buttons at least 44px even when caller styles request less", () => {
  targets.items = [];
  const press = vi.fn();
  renderToStaticMarkup(
    React.createElement(
      Button,
      {
        small: true,
        label: "Import music",
        onPress: press,
        style: { height: 20, minHeight: 10 },
      },
      "Import music",
    ),
  );
  const action = targets.items.find((item) => item.label === "Import music")!;
  expect(action.minHeight ?? 0).toBeGreaterThanOrEqual(44);
  expect(action.minWidth ?? 0).toBeGreaterThanOrEqual(44);
  action.onPress!();
  expect(press).toHaveBeenCalledOnce();
});
it("keeps both vocabulary navigation targets at least 44px with their original routes", () => {
  targets.items = [];
  vi.mocked(router.replace).mockClear();
  renderToStaticMarkup(
    React.createElement(VocabularyTabs, {
      active: "words",
      wordsCount: 12,
      dueCount: 3,
    }),
  );
  const links = targets.items.filter((item) => item.role === "link");
  expect(links).toHaveLength(2);
  for (const link of links) {
    expect(link.minHeight ?? 0).toBeGreaterThanOrEqual(44);
    link.onPress!();
  }
  expect(router.replace).toHaveBeenNthCalledWith(1, "/vocabulary");
  expect(router.replace).toHaveBeenNthCalledWith(2, "/review");
});

it("keeps short selected pills at least 44px on both axes", () => {
  targets.items = [];
  const press = vi.fn();
  const html = renderToStaticMarkup(
    React.createElement(Pill, { active: true, onPress: press }, "1×"),
  );
  expect(targets.items[0].minHeight ?? 0).toBeGreaterThanOrEqual(44);
  expect(targets.items[0].minWidth ?? 0).toBeGreaterThanOrEqual(44);
  expect(html).toContain('aria-pressed="true"');
  expect(html).toContain("background-color:#EAF0E3");
  targets.items[0].onPress!();
  expect(press).toHaveBeenCalledOnce();
});
