import React, { type PropsWithChildren } from "react";
import type { LucideProps } from "lucide-react-native";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => ({
  View: ({ children, style }: PropsWithChildren<{ style: object }>) =>
    React.createElement("div", { style }, children),
  Pressable: ({
    children,
    style,
    accessibilityState,
  }: PropsWithChildren<{
    style: (interaction: { hovered: boolean; pressed: boolean }) => object[];
    accessibilityState: { selected: boolean; disabled: boolean };
  }>) =>
    React.createElement(
      "button",
      {
        style: Object.assign({}, ...style({ hovered: false, pressed: false })),
        disabled: accessibilityState?.disabled,
        "aria-pressed": accessibilityState?.selected,
      },
      children,
    ),
  StyleSheet: {
    create: (styles: object) => styles,
    flatten: (style: object) => style,
  },
}));
vi.mock("lucide-react-native", () => ({ X: () => null }));
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
import { IconButton } from "../src/shared/ui";

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
it("shows active controls with a dark green background and white icon", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Loop verse",
      active: true,
      onPress: () => {},
    }),
  );
  expect(html).toContain("background-color:#4C6244");
  expect(html).toContain('stroke="#FFFFFF"');
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

it("uses a solid icon for saved bookmarks while other active controls stay outlined", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Saved verse",
      active: true,
      fillActive: true,
      onPress: () => {},
    }),
  );
  expect(html).toContain('fill="#FFFFFF"');
});

it("keeps a 44px touch target despite a smaller external style and visual badge", () => {
  const html = renderToStaticMarkup(
    React.createElement(IconButton, {
      icon: Icon,
      label: "Loop verse",
      active: true,
      visualSize: 20,
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
