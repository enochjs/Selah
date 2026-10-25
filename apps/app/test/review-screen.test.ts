import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { ReviewScreen } from "../src/features/review/ReviewScreen";
import { reviewQueue } from "../src/domain/vocabulary";
const render = () => draw(React.createElement(ReviewScreen));
beforeEach(() => {
  resetUI();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-25T12:00:00Z"));
  useAppStore.setState(
    { ...useAppStore.getInitialState(), words: [], reviews: [] },
    true,
  );
  for (const word of ["family", "grace"])
    useAppStore
      .getState()
      .addWord(word, "释义", "Exodus 1:1", "A long saved sentence");
});
afterEach(() => vi.useRealTimers());
it.each(["忘记了", "有点困难", "记得", "很轻松"])(
  "reveals then grades %s using the original store and advances",
  (rating) => {
    render();
    const queue = reviewQueue(useAppStore.getState().words, [], 10, new Date());
    press("开始今日回顾");
    let html = render();
    expect(html).not.toContain("单词回顾");
    expect(ui.actions.some((a) => a.label === rating)).toBe(false);
    press("揭晓释义");
    html = render();
    expect(ui.scrolls.every((s) => !s.includes("10 分钟后"))).toBe(true);
    press(rating);
    render();
    expect(useAppStore.getState().reviews).toHaveLength(1);
    expect(useAppStore.getState().reviews[0]).toMatchObject({
      wordId: queue[0].id,
      rating: {
        忘记了: "again",
        有点困难: "hard",
        记得: "good",
        很轻松: "easy",
      }[rating],
    });
    expect(render()).toContain(queue[1].word);
    expect(ui.actions.some((a) => a.label === "揭晓释义")).toBe(true);
  },
);
it("exits without recording a review", () => {
  render();
  press("开始今日回顾");
  render();
  press("退出本次回顾");
  expect(render()).toContain("单词回顾");
  expect(useAppStore.getState().reviews).toHaveLength(0);
});
it.each(["loading", "error", "missing", "found"] as const)(
  "keeps all ratings outside the scroller with %s definitions and long notes",
  (status) => {
    ui.lookupStatus = status;
    ui.meaning = "Long definition ".repeat(80);
    useAppStore.setState({
      words: useAppStore
        .getState()
        .words.map((word) => ({ ...word, note: "Personal note ".repeat(80) })),
    });
    render();
    press("开始今日回顾");
    render();
    press("揭晓释义");
    render();
    for (const label of ["忘记了", "有点困难", "记得", "很轻松"])
      expect(ui.actions.some((a) => a.label === label)).toBe(true);
    expect(ui.scrolls.every((s) => !s.includes("10 分钟后"))).toBe(true);
    expect(ui.scrolls.some((s) => s.includes("Personal note"))).toBe(true);
    press("记得");
    expect(useAppStore.getState().reviews).toHaveLength(1);
  },
);
