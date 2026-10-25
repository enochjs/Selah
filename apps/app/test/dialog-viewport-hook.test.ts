import { beforeEach, expect, it, vi } from "vitest";
import type { ViewStyle } from "react-native";
const harness = vi.hoisted(() => ({
  viewport: undefined as ViewStyle | undefined,
  deps: undefined as unknown[] | undefined,
  cleanup: undefined as undefined | (() => void),
  effects: [] as (() => void)[],
  platform: "web",
}));
vi.mock("react", () => ({
  useState: () => [
    harness.viewport,
    (value: ViewStyle) => {
      harness.viewport = value;
    },
  ],
  useEffect: (effect: () => (() => void) | undefined, deps: unknown[]) => {
    if (
      !harness.deps ||
      deps.some((value, index) => !Object.is(value, harness.deps![index]))
    ) {
      harness.deps = deps;
      harness.effects.push(() => {
        harness.cleanup?.();
        harness.cleanup = effect();
      });
    }
  },
}));
vi.mock("react-native", () => ({
  Platform: {
    get OS() {
      return harness.platform;
    },
  },
}));
import { useDialogViewport } from "../src/shared/use-dialog-viewport";
const listeners = new Map<string, () => void>();
const visual = {
  height: 720,
  offsetTop: 0,
  addEventListener: vi.fn((name: string, listener: () => void) =>
    listeners.set(name, listener),
  ),
  removeEventListener: vi.fn((name: string) => listeners.delete(name)),
};
function render(visible = true, keyboardAware = true) {
  useDialogViewport(visible, keyboardAware);
  harness.effects.splice(0).forEach((effect) => effect());
  return useDialogViewport(visible, keyboardAware);
}
beforeEach(() => {
  harness.viewport = undefined;
  harness.deps = undefined;
  harness.effects = [];
  harness.cleanup = undefined;
  harness.platform = "web";
  visual.height = 720;
  visual.offsetTop = 0;
  listeners.clear();
  vi.clearAllMocks();
  vi.stubGlobal("window", { visualViewport: visual });
});
it("keeps the visual viewport height authoritative instead of a zero flex basis", () => {
  const style = render();
  expect(style).toMatchObject({
    height: 720,
    top: 0,
    width: "100%",
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: "auto",
  });
  expect(style).not.toHaveProperty("flex");
});
it("tracks the keyboard viewport and stops listening when closed", () => {
  render();
  visual.height = 420;
  visual.offsetTop = 35;
  listeners.get("resize")!();
  expect(render()).toMatchObject({ height: 420, top: 35 });
  expect(render(false)).toBeUndefined();
  expect(listeners.size).toBe(0);
});
it("leaves native keyboard sizing to the native container", () => {
  harness.platform = "ios";
  expect(render()).toBeUndefined();
  expect(listeners.size).toBe(0);
});
it("does not override dialogs that do not opt into keyboard avoidance", () => {
  expect(render(true, false)).toBeUndefined();
  expect(listeners.size).toBe(0);
});
