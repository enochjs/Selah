import React from "react";
import { beforeEach, expect, it } from "vitest";
import { draw, press, resetUI, ui } from "./helpers/learning-ui";
import { useAppStore } from "../src/state/app-store";
import { VocabularyScreen } from "../src/features/vocabulary/VocabularyScreen";
import { MusicScreen } from "../src/features/audio/MusicScreen";
beforeEach(() => {
  resetUI();
  useAppStore.setState(
    { ...useAppStore.getInitialState(), words: [], reviews: [], songs: [] },
    true,
  );
});
it("cancels word removal and accurately preserves historical review records after confirmation", () => {
  useAppStore.getState().addWord("family", "meaning", "", "", "My note");
  const word = useAppStore.getState().words[0];
  useAppStore.getState().reviewWord(word.id, "good");
  const render = () => draw(React.createElement(VocabularyScreen));
  render();
  press("移除 family");
  expect(render()).toContain("历史回顾记录保留");
  press("保留单词");
  expect(useAppStore.getState().words).toHaveLength(1);
  render();
  press("移除 family");
  const html = render();
  expect(html).toMatch(/<footer>[\s\S]*确认移除[\s\S]*<\/footer>/);
  press("确认移除");
  expect(useAppStore.getState().words).toHaveLength(0);
  expect(useAppStore.getState().reviews).toHaveLength(1);
});
it("locks async music removal, keeps failures retryable, and removes the saved item only after success", async () => {
  useAppStore
    .getState()
    .addSong({
      id: "song-1",
      title: "My hymn",
      uri: "mock-only://audio",
      addedAt: new Date().toISOString(),
    });
  let reject!: (e: Error) => void;
  ui.deleteAudio.mockImplementationOnce(
    () =>
      new Promise((_resolve, r) => {
        reject = r;
      }),
  );
  const render = () => draw(React.createElement(MusicScreen));
  render();
  press("移除诗歌");
  render();
  const submit = ui.actions.find((a) => a.label === "确认移除")!.onPress;
  const pending = submit();
  submit();
  render();
  expect(ui.dialogs.find((d) => d.visible)?.dismissible).toBe(false);
  expect(ui.deleteAudio).toHaveBeenCalledOnce();
  reject(new Error("test failure"));
  await pending;
  expect(render()).toContain("移除失败，请重试。");
  expect(useAppStore.getState().songs).toHaveLength(1);
  expect(ui.dialogs.find((d) => d.visible)?.dismissible).toBe(true);
  ui.deleteAudio.mockResolvedValueOnce(undefined);
  await press("确认移除");
  expect(useAppStore.getState().songs).toHaveLength(0);
  expect(ui.toggle).toHaveBeenCalled();
});
