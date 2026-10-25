import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { WordDialog } from "../src/features/vocabulary/WordDialog";
const onClose = vi.fn();
const render = () =>
  draw(
    React.createElement(WordDialog, {
      selection: { word: "family", reference: "", context: "" },
      onClose,
    }),
  );
beforeEach(() => {
  resetUI();
  useAppStore.setState(
    { ...useAppStore.getInitialState(), words: [], reviews: [] },
    true,
  );
});
it.each([false, true])(
  "guards a dirty note for a saved=%s word without silently saving",
  (saved) => {
    if (saved)
      useAppStore
        .getState()
        .addWord("family", "Old meaning", "", "", "Old note");
    render();
    press(saved ? "编辑笔记" : "添加笔记");
    render();
    ui.inputs[0].onChangeText("New draft");
    render();
    ui.dialogs[0].onClose();
    expect(render()).toContain("继续编辑");
    expect(onClose).not.toHaveBeenCalled();
    press("继续编辑");
    render();
    expect(ui.inputs[0]).toMatchObject({ value: "New draft" });
    ui.dialogs[0].onClose();
    render();
    press("放弃修改");
    render();
    expect(ui.dialogs[0].visible).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
    ui.dialogs[0].onDismiss!();
    expect(onClose).toHaveBeenCalledOnce();
    expect(useAppStore.getState().words[0]?.note).toBe(
      saved ? "Old note" : undefined,
    );
  },
);
it.each([false, true])(
  "explicitly saves and closes a saved=%s word",
  (saved) => {
    if (saved)
      useAppStore
        .getState()
        .addWord("family", "Old meaning", "old ref", "old context", "Old note");
    render();
    press(saved ? "编辑笔记" : "添加笔记");
    render();
    ui.inputs[0].onChangeText("");
    render();
    ui.inputs[0].onChangeText("New note");
    render();
    ui.dialogs[0].onClose();
    render();
    press(saved ? "保存并关闭" : "加入生词本并关闭");
    render();
    expect(useAppStore.getState().words[0]).toMatchObject({
      note: "New note",
      meaning: saved ? "Old meaning" : "家庭",
    });
    if (saved)
      expect(useAppStore.getState().words[0]).toMatchObject({
        reference: "old ref",
        context: "old context",
      });
  },
);
it("ignores whitespace-only changes and does not add an unsaved word", () => {
  render();
  press("添加笔记");
  render();
  ui.inputs[0].onChangeText("   ");
  render();
  ui.dialogs[0].onClose();
  render();
  expect(ui.dialogs[0].visible).toBe(false);
  expect(useAppStore.getState().words).toHaveLength(0);
});
it("closes via the header without writing whitespace-only changes to a saved note", () => {
  useAppStore.getState().addWord("family", "Old meaning", "", "", "Old note");
  render();
  press("编辑笔记");
  render();
  ui.inputs[0].onChangeText(" Old note  ");
  render();
  press("关闭查词");
  render();
  expect(ui.dialogs[0].visible).toBe(false);
  expect(useAppStore.getState().words[0].note).toBe("Old note");
});
it("treats clearing an existing note as a dirty change", () => {
  useAppStore.getState().addWord("family", "Old meaning", "", "", "Old note");
  render();
  press("编辑笔记");
  render();
  ui.inputs[0].onChangeText("");
  render();
  ui.dialogs[0].onClose();
  expect(render()).toContain("保存并关闭");
  press("保存并关闭");
  expect(useAppStore.getState().words[0].note).toBe("");
});
it("cancels an intended return to input when continuing to edit", () => {
  const onBack = vi.fn();
  const drawManual = () =>
    draw(
      React.createElement(WordDialog, {
        selection: { word: "family", reference: "", context: "" },
        onClose,
        onBack,
      }),
    );
  drawManual();
  press("添加笔记");
  drawManual();
  ui.inputs[0].onChangeText("Draft");
  drawManual();
  press("返回输入");
  drawManual();
  press("继续编辑");
  drawManual();
  press("加入生词本");
  drawManual();
  ui.dialogs[0].onDismiss!();
  expect(onBack).not.toHaveBeenCalled();
  expect(onClose).toHaveBeenCalledOnce();
});
it("previews the current draft when hiding the editor without saving it", () => {
  useAppStore.getState().addWord("family", "Old meaning", "", "", "Old note");
  render();
  press("编辑笔记");
  render();
  ui.inputs[0].onChangeText("Draft preview");
  render();
  press("收起笔记");
  expect(render()).toContain("Draft preview");
  expect(useAppStore.getState().words[0].note).toBe("Old note");
});
