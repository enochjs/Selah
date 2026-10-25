import { expect, it, vi } from "vitest";
import {
  ChapterMotion,
  type ChapterMotionDriver,
  type ChapterFrame,
} from "../src/features/reader/chapter-motion";

function fixture() {
  const frames: (ChapterFrame & { duration: number })[] = [];
  const completions: ((finished: boolean) => void)[] = [];
  let frame: ChapterFrame = { x: 0, opacity: 1 };
  const driver: ChapterMotionDriver = {
    stop: vi.fn(),
    set: (next) => {
      frame = next;
    },
    animate: (next, duration, complete) => {
      frames.push({ ...next, duration });
      completions.push(complete);
    },
  };
  const motion = new ChapterMotion("psalms:23", driver);
  return { motion, frames, completions, frame: () => frame };
}

it.each([-1, 1] as const)(
  "finishes the old chapter before revealing the new chapter in direction %s",
  (direction) => {
    const f = fixture();
    const navigate = vi.fn();
    f.motion.turn("psalms:24", direction, 393, false, navigate);
    expect(navigate).not.toHaveBeenCalled();
    expect(f.frames[0].x * direction).toBeLessThan(0);
    expect(f.frames[0].opacity).toBe(0);
    f.completions[0](true);
    expect(navigate).toHaveBeenCalledOnce();
    expect(f.frame().x * direction).toBeGreaterThan(0);
    expect(f.frame().opacity).toBe(0);
    expect(f.motion.busy).toBe(true);
    f.motion.show("psalms:24");
    expect(f.frames[1]).toMatchObject({ x: 0, opacity: 1 });
    f.completions[1](true);
    expect(f.motion.busy).toBe(false);
  },
);

it("follows the finger, resists the Bible boundary, and returns after a cancelled short swipe", () => {
  const f = fixture();
  f.motion.drag(-60, 393, true, false);
  const resisted = Math.abs(f.frame().x);
  f.motion.drag(-60, 393, true, true);
  expect(Math.abs(f.frame().x)).toBeGreaterThan(resisted);
  expect(f.frame().x).toBeLessThan(0);
  f.motion.settle(false);
  expect(f.frames[0]).toMatchObject({ x: 0, opacity: 1 });
  f.completions[0](true);
  expect(f.motion.busy).toBe(false);
});

it("ignores repeated turns during a transition rather than skipping chapters", () => {
  const f = fixture();
  const first = vi.fn(),
    second = vi.fn();
  f.motion.turn("psalms:24", 1, 393, false, first);
  f.motion.turn("psalms:22", -1, 393, false, second);
  expect(f.frames).toHaveLength(1);
  f.completions[0](true);
  expect(first).toHaveBeenCalledOnce();
  expect(second).not.toHaveBeenCalled();
});

it("does not navigate from a stale animation after another chapter is opened or the reader unmounts", () => {
  for (const external of [true, false]) {
    const f = fixture();
    const navigate = vi.fn();
    f.motion.turn("psalms:24", 1, 393, false, navigate);
    if (external) f.motion.show("john:1");
    else f.motion.cancel();
    f.completions[0](true);
    expect(navigate).not.toHaveBeenCalled();
    expect(f.frame()).toEqual({ x: 0, opacity: 1 });
    expect(f.motion.busy).toBe(false);
  }
});

it.each([true, null])(
  "switches immediately without motion while reduced motion is %s",
  (reducedMotion) => {
    const f = fixture();
    const navigate = vi.fn();
    f.motion.turn("psalms:24", 1, 393, reducedMotion, navigate);
    expect(navigate).toHaveBeenCalledOnce();
    expect(f.frames).toHaveLength(0);
    expect(f.frame()).toEqual({ x: 0, opacity: 1 });
    expect(f.motion.busy).toBe(false);
  },
);

it("restores a fully visible chapter if its exit animation is interrupted", () => {
  const f = fixture();
  const navigate = vi.fn();
  f.motion.turn("psalms:24", 1, 393, false, navigate);
  f.completions[0](false);
  expect(navigate).not.toHaveBeenCalled();
  expect(f.frame()).toEqual({ x: 0, opacity: 1 });
  expect(f.motion.busy).toBe(false);
});
