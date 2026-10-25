import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { ReviewScreen } from "../src/features/review/ReviewScreen";
const render = () => draw(React.createElement(ReviewScreen));
beforeEach(() => {
  resetUI();
  useAppStore.setState(
    { ...useAppStore.getInitialState(), words: [], reviews: [] },
    true,
  );
});
it("drafts without changing the goal, cancels via the shared close callback, and saves once", () => {
  const save = vi.spyOn(useAppStore.getState(), "setDailyGoal");
  render();
  press("设置每日计划");
  render();
  press("30 词 / 天");
  render();
  expect(save).not.toHaveBeenCalled();
  ui.dialogs[0].onClose();
  render();
  expect(useAppStore.getState().dailyGoal).toBe(10);
  press("设置每日计划");
  render();
  press("保存计划");
  expect(save).toHaveBeenCalledExactlyOnceWith(10);
  expect(useAppStore.getState().dailyGoal).toBe(10);
});
it("discards Cancel and initializes a reopened draft from the latest store", () => {
  render();
  press("设置每日计划");
  render();
  press("30 词 / 天");
  render();
  press("取消");
  render();
  expect(useAppStore.getState().dailyGoal).toBe(10);
  useAppStore.getState().setDailyGoal(15);
  render();
  press("设置每日计划");
  render();
  press("保存计划");
  expect(useAppStore.getState().dailyGoal).toBe(15);
});
it("commits the selected draft only on Save", () => {
  render();
  press("设置每日计划");
  render();
  press("20 词 / 天");
  render();
  press("保存计划");
  expect(useAppStore.getState().dailyGoal).toBe(20);
});
it("exposes one checked radio in the daily goal group and updates only the draft", () => {
  render();
  press("设置每日计划");
  let html = render();
  expect(html).toContain('role="radiogroup" aria-label="每日回顾目标"');
  expect(html.match(/role="radio"/g)).toHaveLength(5);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="10 词 / 天" aria-checked="true"');
  press("30 词 / 天");
  html = render();
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  expect(html).toContain('aria-label="30 词 / 天" aria-checked="true"');
  expect(html).toContain('aria-label="10 词 / 天" aria-checked="false"');
  expect(useAppStore.getState().dailyGoal).toBe(10);
});
