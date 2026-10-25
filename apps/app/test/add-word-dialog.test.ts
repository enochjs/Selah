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
it("waits for add dismissal before lookup, then waits for lookup dismissal before returning to input", () => {
  render();
  press("添加单词");
  render();
  ui.inputs
    .find((i) => i.accessibilityLabel === "新单词")!
    .onChangeText("family");
  render();
  ui.inputs.find((i) => i.accessibilityLabel === "新单词")!.onSubmitEditing!();
  render();
  expect(ui.dialogs.filter((d) => d.visible)).toHaveLength(0);
  ui.dialogs.find((d) => d.title === "添加单词")!.onDismiss!();
  render();
  expect(ui.dialogs.filter((d) => d.visible)).toHaveLength(1);
  press("返回输入");
  render();
  expect(ui.dialogs.filter((d) => d.visible)).toHaveLength(0);
  ui.dialogs.find((d) => d.title === "family")!.onDismiss!();
  render();
  expect(ui.dialogs.filter((d) => d.visible)).toHaveLength(1);
  expect(
    ui.inputs.find((i) => i.accessibilityLabel === "新单词"),
  ).toMatchObject({ value: "family" });
});
it("keeps canceled input for the same session", () => {
  render();
  press("添加单词");
  render();
  ui.inputs
    .find((i) => i.accessibilityLabel === "新单词")!
    .onChangeText("grace");
  render();
  ui.dialogs.find((d) => d.visible)!.onClose();
  render();
  ui.dialogs.find((d) => d.title === "添加单词")!.onDismiss!();
  render();
  press("添加单词");
  render();
  expect(
    ui.inputs.find((i) => i.accessibilityLabel === "新单词"),
  ).toMatchObject({ value: "grace" });
});
it("clears the manual input only after adding the word", () => {
  render();
  press("添加单词");
  render();
  ui.inputs
    .find((i) => i.accessibilityLabel === "新单词")!
    .onChangeText("family");
  render();
  press("查看释义");
  render();
  ui.dialogs.find((d) => d.title === "添加单词")!.onDismiss!();
  render();
  press("加入生词本");
  render();
  ui.dialogs.find((d) => d.title === "family")!.onDismiss!();
  render();
  press("添加单词");
  render();
  expect(
    ui.inputs.find((i) => i.accessibilityLabel === "新单词"),
  ).toMatchObject({ value: "" });
  expect(useAppStore.getState().words.map((w) => w.word)).toEqual(["family"]);
});
