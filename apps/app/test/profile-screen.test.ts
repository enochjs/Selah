import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { ShellActionsContext } from "../src/shared/shell-actions-context";
import { ProfileScreen } from "../src/features/profile/ProfileScreen";
import { AboutScreen } from "../src/features/profile/AboutScreen";
import { resourceLinks } from "../src/data/resource-info";
import { Linking } from "react-native";

beforeEach(() => {
  resetUI();
  useAppStore.setState({
    ...useAppStore.getInitialState(),
    words: [],
    reviews: [],
    bookmarks: [],
  });
});

it.each(["zh", "en"])("opens each personal destination in %s", (locale) => {
  ui.locale = locale;
  const openBookmarks = vi.fn();
  draw(
    React.createElement(
      ShellActionsContext.Provider,
      {
        value: { openBookmarks, openSearch: vi.fn(), dialogOpen: false },
      },
      React.createElement(ProfileScreen),
    ),
  );
  const destinations =
    locale === "zh"
      ? [
          ["我的词汇", "/vocabulary"],
          ["下载管理", "/downloads"],
          ["设置", "/settings"],
          ["关于与版权", "/about"],
        ]
      : [
          ["My vocabulary", "/vocabulary"],
          ["Downloads", "/downloads"],
          ["Settings", "/settings"],
          ["About & credits", "/about"],
        ];
  for (const [label, route] of destinations) {
    press(label);
    expect(ui.push).toHaveBeenLastCalledWith(route);
  }
  press(locale === "zh" ? "经文收藏" : "Saved verses");
  expect(openBookmarks).toHaveBeenCalledOnce();
});

it("reads real saved counts and due words without altering learning or reading data", () => {
  useAppStore
    .getState()
    .addWord("peace", "平安", "John 14:27", "Peace I leave with you.");
  useAppStore
    .getState()
    .addWord("light", "光", "John 8:12", "I am the light of the world.");
  useAppStore.setState({
    words: useAppStore
      .getState()
      .words.map((word) =>
        word.id === "light" ? { ...word, dueAt: "2099-01-01T00:00:00Z" } : word,
      ),
    bookmarks: ["john:8:12"],
  });
  const before = useAppStore.getState();
  const html = draw(React.createElement(ProfileScreen));
  expect(html).toContain("已收藏 2 个单词 · 待复习 1 个");
  expect(html).toContain("已收藏 1 处经文");
  press("我的词汇");
  expect(useAppStore.getState()).toBe(before);
});

it("uses the configured resource sources for the credits page", () => {
  vi.mocked(Linking.openURL).mockResolvedValue(undefined);
  const html = draw(React.createElement(AboutScreen));
  expect(html).toContain("内容来源与授权");
  for (const link of resourceLinks) {
    press(link.title);
    expect(Linking.openURL).toHaveBeenLastCalledWith(link.url);
  }
});
