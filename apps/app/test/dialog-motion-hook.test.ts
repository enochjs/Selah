import { beforeEach, expect, it, vi } from "vitest";
const context = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void | (() => void))[],
  completions: [] as ((result: { finished: boolean }) => void)[],
}));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells))
      context.cells[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      context.cells[index],
      (next: unknown) => {
        context.cells[index] = next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells)) context.cells[index] = { current: initial };
    return context.cells[index];
  },
  useMemo: (compute: () => unknown) => compute(),
  useEffect: (effect: () => void | (() => void)) => {
    context.effects.push(effect);
  },
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ height: 852 }),
  Platform: { OS: "web" },
  AccessibilityInfo: {
    isReduceMotionEnabled: async () => true,
    addEventListener: () => ({ remove: () => {} }),
  },
  Easing: { out: () => {}, in: () => {}, cubic: () => {} },
  Animated: {
    Value: class {
      stopAnimation() {}
      interpolate() {
        return 0;
      }
    },
    timing: () => ({}),
    parallel: () => ({
      start: (complete: (result: { finished: boolean }) => void) =>
        context.completions.push(complete),
    }),
  },
}));
import { useDialogMotion } from "../src/shared/use-dialog-motion";
beforeEach(() => {
  context.cursor = 0;
  context.cells = [];
  context.effects = [];
  context.completions = [];
});
function render(visible: boolean, bottom: boolean, dismissed: () => void) {
  context.cursor = 0;
  const result = useDialogMotion(visible, bottom, dismissed);
  const effects = context.effects.splice(0);
  effects.forEach((effect) => effect());
  return result;
}
it.each([true, false])(
  "retains a closing dialog until animation completion and then dismisses, bottom=%s",
  async (bottom) => {
    const dismissed = vi.fn();
    render(true, bottom, dismissed);
    await Promise.resolve();
    render(true, bottom, dismissed);
    const closing = render(false, bottom, dismissed);
    expect(closing.modalVisible).toBe(true);
    expect(dismissed).not.toHaveBeenCalled();
    const complete = context.completions.at(-1);
    expect(complete).toBeDefined();
    complete?.({ finished: true });
    expect(dismissed).toHaveBeenCalledOnce();
    expect(render(false, bottom, dismissed).modalVisible).toBe(false);
  },
);
