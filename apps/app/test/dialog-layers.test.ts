import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("react-native", () => {
  const element = ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children);
  return {
    View: element,
    Text: element,
    Pressable: element,
    ScrollView: element,
    KeyboardAvoidingView: element,
    Platform: { OS: "android" },
    Modal: ({
      children,
      animationType,
    }: PropsWithChildren<{ animationType: string }>) =>
      React.createElement(
        "section",
        { "data-host-animation": animationType },
        children,
      ),
    Animated: {
      View: ({
        children,
        style,
      }: PropsWithChildren<{ style: { transform?: unknown }[] }>) =>
        React.createElement(
          "div",
          {
            "data-animated-layer": style.some((part) => part?.transform)
              ? "panel"
              : "backdrop",
          },
          children,
        ),
    },
    StyleSheet: {
      create: (value: unknown) => value,
      absoluteFill: {},
      absoluteFillObject: {},
    },
  };
});
vi.mock("lucide-react-native", () => ({ X: () => null }));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {} }));
vi.mock("../src/shared/use-dialog-motion", () => ({
  useDialogMotion: () => ({
    modalVisible: true,
    onShow: () => {},
    backdropStyle: { opacity: 0.5 },
    panelStyle: { transform: [{ translateY: 100 }] },
  }),
}));
import { Dialog } from "../src/shared/ui";

it("keeps the full-screen modal stationary while backdrop and panel animate independently", () => {
  const html = renderToStaticMarkup(
    React.createElement(Dialog, {
      visible: true,
      title: "family",
      presentation: "bottom",
      onClose: () => {},
      children: React.createElement("span", null, "definition"),
    }),
  );
  expect(html).toContain('data-host-animation="none"');
  expect(html).toMatch(/data-animated-layer="backdrop"><\/div>/);
  expect(html).toMatch(/data-animated-layer="panel">[\s\S]*definition/);
});
it("preserves the native fade for centered dialogs", () => {
  const html = renderToStaticMarkup(
    React.createElement(Dialog, {
      visible: true,
      title: "Settings",
      onClose: () => {},
    }),
  );
  expect(html).toContain('data-host-animation="fade"');
});
