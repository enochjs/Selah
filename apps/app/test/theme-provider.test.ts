import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { beforeEach, expect, it, vi } from "vitest";
import type { ThemePreference } from "../src/domain/appearance";

const device = vi.hoisted(() => ({ scheme: "light" as "light" | "dark" }));
vi.mock("react-native", () => ({ useColorScheme: () => device.scheme }));
vi.mock("expo-status-bar", () => ({
  StatusBar: ({ style }: { style: string }) =>
    React.createElement("span", { "data-status-bar": style }),
}));
vi.mock("../src/shared/ThemeDocument", () => ({ ThemeDocument: () => null }));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("../src/state/app-store", async (original) => {
  const { useAppStore: store } =
    await original<typeof import("../src/state/app-store")>();
  return {
    useAppStore: Object.assign(
      (select: (state: ReturnType<typeof store.getState>) => unknown) =>
        select(store.getState()),
      store,
    ),
  };
});
import { ThemeProvider } from "../src/shared/ThemeProvider";
import { useTheme } from "../src/shared/theme-context";
import { useAppStore } from "../src/state/app-store";

function Probe() {
  const theme = useTheme();
  return React.createElement(
    "p",
    {
      style: {
        backgroundColor: theme.colors.background,
        color: theme.colors.text,
      },
    },
    theme.id,
  );
}
function render(preference: ThemePreference) {
  useAppStore.setState({ themePreference: preference });
  return renderToStaticMarkup(
    React.createElement(ThemeProvider, null, React.createElement(Probe)),
  );
}
beforeEach(() => {
  device.scheme = "light";
});

it("provides a resolved theme and matching native status bar to the same child tree", () => {
  expect(render("redemption")).toContain("background-color:#FAF6F1");
  expect(render("night")).toContain('data-status-bar="light"');
  expect(render("mist")).toContain('data-status-bar="dark"');
});
it("updates system-following mode while preserving explicit choices", () => {
  expect(render("system")).toContain(">olive</p>");
  device.scheme = "dark";
  expect(render("system")).toContain(">night</p>");
  expect(render("redemption")).toContain(">redemption</p>");
});
it("allows native builds to receive system appearance changes", () => {
  const config = JSON.parse(
    readFileSync(new URL("../app.json", import.meta.url), "utf8"),
  );
  expect(config.expo.userInterfaceStyle).toBe("automatic");
  const pkg = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  expect(pkg.dependencies["expo-system-ui"]).toMatch(/^~/);
});
