import React from "react";
import { beforeEach, expect, it } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { VocabularyScreen } from "../src/features/vocabulary/VocabularyScreen";
const render = () => draw(React.createElement(VocabularyScreen));
beforeEach(() => {
  resetUI();
  useAppStore.setState(
    { ...useAppStore.getInitialState(), words: [], reviews: [] },
    true,
  );
});
it("distinguishes an empty library and routes its action to the Bible", () => {
  expect(render()).toContain("还没有收藏单词");
  press("去读经");
  expect(ui.push).toHaveBeenCalledWith("/bible");
});
it("clears only search when a saved library has no matches", () => {
  useAppStore.getState().addWord("family", "家庭", "", "");
  render();
  ui.inputs[0].onChangeText("zzzzzz");
  expect(render()).toContain("没有匹配的单词");
  press("清除搜索");
  expect(render()).toContain("family");
  expect(ui.push).not.toHaveBeenCalled();
});
it.each(["待回顾", "已熟悉"])(
  "offers all words for an empty %s filter",
  (filter) => {
    useAppStore.getState().addWord("family", "家庭", "", "");
    useAppStore.setState({
      words: useAppStore
        .getState()
        .words.map((w) => ({ ...w, dueAt: "2099-01-01T00:00:00Z" })),
    });
    render();
    press(filter);
    expect(render()).toContain(
      filter === "待回顾" ? "今天没有待回顾单词" : "还没有已熟悉的单词",
    );
    press("查看全部");
    expect(render()).toContain("family");
  },
);
