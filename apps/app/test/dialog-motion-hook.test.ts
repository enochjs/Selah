import { beforeEach, expect, it, vi } from "vitest";

type EffectCell = { deps?: unknown[]; cleanup?: void | (() => void) };
const context = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
  completions: [] as ((result: { finished: boolean }) => void)[],
  platform: "web",
}));
function changed(previous: unknown[] | undefined, next: unknown[]) {
  return (
    !previous || next.some((value, index) => !Object.is(value, previous[index]))
  );
}
function effectHook(effect: () => void | (() => void), deps: unknown[]) {
  const index = context.cursor++;
  const cell = context.cells[index] as EffectCell | undefined;
  if (!cell || changed(cell.deps, deps)) {
    context.effects.push(() => {
      cell?.cleanup?.();
      context.cells[index] = { deps, cleanup: effect() };
    });
  }
}
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells))
      context.cells[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      context.cells[index],
      (next: unknown) => {
        context.cells[index] =
          typeof next === "function" ? next(context.cells[index]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells)) context.cells[index] = { current: initial };
    return context.cells[index];
  },
  useMemo: (compute: () => unknown, deps: unknown[]) => {
    const index = context.cursor++;
    const cell = context.cells[index] as
      { value: unknown; deps: unknown[] } | undefined;
    if (!cell || changed(cell.deps, deps))
      context.cells[index] = { value: compute(), deps };
    return (context.cells[index] as { value: unknown }).value;
  },
  useEffect: effectHook,
  useLayoutEffect: effectHook,
}));
vi.mock("react-native", () => ({
  useWindowDimensions: () => ({ height: 852 }),
  Platform: {
    get OS() {
      return context.platform;
    },
  },
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
  context.platform = "web";
});
function commit() {
  context.effects.splice(0).forEach((effect) => effect());
}
function render(
  visible: boolean,
  bottom: boolean,
  dismissed: () => void,
  committed = true,
) {
  context.cursor = 0;
  const result = useDialogMotion(visible, bottom, dismissed);
  if (committed) commit();
  return result;
}
async function open(bottom: boolean, dismissed: () => void) {
  render(true, bottom, dismissed);
  await Promise.resolve();
  render(true, bottom, dismissed).onShow();
}
function finishPanel() {
  const complete = context.completions.at(-1);
  expect(complete).toBeDefined();
  complete?.({ finished: true });
}
it.each(["ios", "web"])(
  "waits for %s host dismissal for both dialog presentations",
  async (platform) => {
    context.platform = platform;
    for (const bottom of [true, false]) {
      const dismissed = vi.fn();
      await open(bottom, dismissed);
      expect(render(false, bottom, dismissed).modalVisible).toBe(true);
      finishPanel();
      expect(dismissed).not.toHaveBeenCalled();
      const hidden = render(false, bottom, dismissed);
      expect(hidden.modalVisible).toBe(false);
      expect(dismissed).not.toHaveBeenCalled();
      hidden.onDismiss?.();
      hidden.onDismiss?.();
      expect(dismissed).toHaveBeenCalledOnce();
    }
  },
);
it("ignores old host callbacks after reopen and during a later close", async () => {
  const dismissed = vi.fn();
  await open(true, dismissed);
  render(false, true, dismissed);
  finishPanel();
  const oldHost = render(false, true, dismissed);
  render(true, true, dismissed);
  oldHost.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
  render(true, true, dismissed).onShow();
  render(false, true, dismissed);
  finishPanel();
  const newHost = render(false, true, dismissed);
  oldHost.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
  newHost.onDismiss?.();
  newHost.onDismiss?.();
  expect(dismissed).toHaveBeenCalledOnce();
});
it("ignores interrupted animation callbacks after reopen", async () => {
  const dismissed = vi.fn();
  await open(false, dismissed);
  render(false, false, dismissed);
  const interrupted = context.completions.at(-1);
  render(true, false, dismissed);
  interrupted?.({ finished: true });
  expect(render(true, false, dismissed).modalVisible).toBe(true);
  expect(dismissed).not.toHaveBeenCalled();
});
it("completes Android dismissal only after the hidden host commits", async () => {
  context.platform = "android";
  const dismissed = vi.fn();
  await open(true, dismissed);
  render(false, true, dismissed);
  finishPanel();
  expect(dismissed).not.toHaveBeenCalled();
  expect(render(false, true, dismissed, false).modalVisible).toBe(false);
  expect(dismissed).not.toHaveBeenCalled();
  commit();
  expect(dismissed).toHaveBeenCalledOnce();
  render(false, true, dismissed);
  expect(dismissed).toHaveBeenCalledOnce();
});
it("does not dismiss an initially hidden dialog", () => {
  const dismissed = vi.fn();
  const hidden = render(false, false, dismissed);
  hidden.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
});
it("waits for an outstanding host close before reopening and suppresses its handoff", async () => {
  const dismissed = vi.fn();
  await open(true, dismissed);
  render(false, true, dismissed);
  finishPanel();
  const hidden = render(false, true, dismissed);
  const reopening = render(true, true, dismissed);
  expect(reopening.modalVisible).toBe(false);
  reopening.onDismiss?.();
  const reopened = render(true, true, dismissed);
  expect(reopened.modalVisible).toBe(true);
  hidden.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
  expect(render(false, true, dismissed).modalVisible).toBe(true);
  finishPanel();
  const closingAgain = render(false, true, dismissed);
  hidden.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
  closingAgain.onDismiss?.();
  expect(dismissed).toHaveBeenCalledOnce();
});
it("ignores host completion after the owning dialog unmounts", async () => {
  const dismissed = vi.fn();
  await open(false, dismissed);
  render(false, false, dismissed);
  finishPanel();
  const hidden = render(false, false, dismissed);
  for (const cell of context.cells) {
    if (cell && typeof cell === "object" && "cleanup" in cell)
      (cell as EffectCell).cleanup?.();
  }
  hidden.onDismiss?.();
  expect(dismissed).not.toHaveBeenCalled();
});

it.each(["ios", "web", "android"])(
  "retains an initially hidden %s host when closed before onShow",
  (platform) => {
    context.platform = platform;
    const dismissed = vi.fn();
    expect(render(false, true, dismissed).modalVisible).toBe(false);
    expect(render(true, true, dismissed).modalVisible).toBe(true);
    const closing = render(false, true, dismissed);
    expect(closing.modalVisible).toBe(true);
    closing.onDismiss();
    expect(dismissed).not.toHaveBeenCalled();
    finishPanel();
    const hidden = render(false, true, dismissed);
    expect(hidden.modalVisible).toBe(false);
    if (platform !== "android") expect(dismissed).not.toHaveBeenCalled();
    hidden.onDismiss();
    hidden.onDismiss();
    expect(dismissed).toHaveBeenCalledOnce();
    expect(render(true, true, dismissed).modalVisible).toBe(true);
    expect(render(false, true, dismissed).modalVisible).toBe(true);
    finishPanel();
    render(false, true, dismissed).onDismiss();
    expect(dismissed).toHaveBeenCalledTimes(2);
  },
);
