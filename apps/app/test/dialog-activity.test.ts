import { expect, it, vi } from "vitest";
import { dialogActivity, registerDialog } from "../src/shared/dialog-activity";
it("tracks overlapping modal hosts until all have finished dismissal", () => {
  const listener = vi.fn();
  const unsubscribe = dialogActivity.subscribe(listener);
  expect(dialogActivity.getSnapshot()).toBe(0);
  const closeArchive = registerDialog();
  const closeShare = registerDialog();
  expect(dialogActivity.getSnapshot()).toBe(2);
  closeArchive();
  expect(dialogActivity.getSnapshot()).toBe(1);
  closeArchive();
  expect(dialogActivity.getSnapshot()).toBe(1);
  closeShare();
  expect(dialogActivity.getSnapshot()).toBe(0);
  expect(listener).toHaveBeenCalledTimes(4);
  unsubscribe();
});
