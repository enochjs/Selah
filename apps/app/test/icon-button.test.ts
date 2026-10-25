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
    accessibilityState: { selected: boolean };
  }>) =>
    React.createElement(
      "button",
      {
        style: Object.assign({}, ...style({ hovered: false, pressed: false })),
        "aria-pressed": accessibilityState?.selected,
      },
      children,
    ),
  StyleSheet: { create: (styles: object) => styles },
}));
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("../src/shared/theme", () => ({
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

it("shrinks the visible badge while preserving the verse button's touch target", () => {
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
    /<button style="width:28px;height:26px;[^"]*background-color:transparent/,
  );
  expect(html).toMatch(
    /<div style="width:20px;height:20px;[^"]*background-color:#4C6244/,
  );
  expect(html).toContain('width="12" height="12"');
});
