import { expect, it } from "vitest";
import {
  DialogMotion,
  dialogTiming,
  type DialogMotionDriver,
} from "../src/shared/dialog-motion";

function fixture() {
  const completions: ((finished: boolean) => void)[] = [];
  const events: string[] = [];
  const driver: DialogMotionDriver = {
    stop: () => {
      events.push("stop");
    },
    animate: (opening, complete) => {
      events.push(opening ? "open" : "close");
      completions.push(complete);
    },
  };
  return { driver, completions, events, motion: new DialogMotion() };
}
it("waits for the system preference before planning any entrance animation", () => {
  expect(dialogTiming(null, true)).toBeNull();
  expect(dialogTiming(true, true)).toEqual({ backdrop: 0, panel: 0 });
  expect(dialogTiming(false, true)).toEqual({ backdrop: 180, panel: 260 });
});
it("can close immediately while the motion preference is still pending", () => {
  expect(dialogTiming(null, false)).toEqual({ backdrop: 0, panel: 0 });
});
it("keeps the sheet mounted until its closing animation finishes", () => {
  const f = fixture();
  let closed = 0;
  f.motion.open(f.driver);
  f.motion.close(f.driver, () => closed++);
  expect(closed).toBe(0);
  f.completions[1](true);
  expect(closed).toBe(1);
});
it("a rapid reopen invalidates an older closing callback", () => {
  const f = fixture();
  let closed = 0;
  f.motion.open(f.driver);
  f.motion.close(f.driver, () => closed++);
  f.motion.open(f.driver);
  f.completions[1](true);
  expect(closed).toBe(0);
});
it("cancels callbacks when interrupted or unmounted and does not dismiss an initially hidden sheet", () => {
  const f = fixture();
  let closed = 0;
  f.motion.close(f.driver, () => closed++);
  expect(f.events).toEqual([]);
  f.motion.open(f.driver);
  f.motion.close(f.driver, () => closed++);
  f.completions[1](false);
  expect(closed).toBe(0);
  f.motion.cancel(f.driver);
  f.completions[1](true);
  expect(closed).toBe(0);
});
