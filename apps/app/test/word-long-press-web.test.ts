import React from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const effects = vi.hoisted(() => ({ cleanup: [] as (() => void)[] }));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => () => void) => effects.cleanup.push(effect()),
}));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/theme", () => ({ colors: { green: "#4C6244" } }));
import { WordText } from "../src/features/reader/WordText.web";

function event(overrides: object = {}) {
  return {
    button: 0,
    isPrimary: true,
    clientX: 10,
    clientY: 10,
    stopPropagation: vi.fn(),
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as React.PointerEvent<HTMLSpanElement>;
}
function word() {
  const onSelect = vi.fn(),
    onLookup = vi.fn();
  const element = WordText({
    text: "shepherd",
    known: false,
    interactive: true,
    onSelect,
    onLookup,
  });
  return {
    handlers: element.props as React.ComponentProps<"span">,
    onSelect,
    onLookup,
  };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", { getSelection: () => ({ toString: () => "" }) });
});
afterEach(() => {
  effects.cleanup.splice(0).forEach((cleanup) => cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
it("selects on a short tap without opening word lookup", () => {
  const { handlers, onSelect, onLookup } = word();
  const press = event();
  handlers.onPointerDown?.(press);
  vi.advanceTimersByTime(200);
  handlers.onPointerUp?.(press);
  handlers.onClick?.(press);
  vi.advanceTimersByTime(500);
  expect(onSelect).toHaveBeenCalledOnce();
  expect(onLookup).not.toHaveBeenCalled();
  expect(press.stopPropagation).toHaveBeenCalled();
});
it("looks up a held word and suppresses selection when released", () => {
  const { handlers, onSelect, onLookup } = word();
  const press = event();
  handlers.onPointerDown?.(press);
  vi.advanceTimersByTime(500);
  expect(onLookup).toHaveBeenCalledOnce();
  handlers.onPointerUp?.(press);
  handlers.onClick?.(press);
  expect(onSelect).not.toHaveBeenCalled();
});
it.each(["move", "cancel", "leave", "scroll"])(
  "cancels lookup and selection after a %s gesture",
  (kind) => {
    const { handlers, onSelect, onLookup } = word();
    const press = event();
    handlers.onPointerDown?.(press);
    if (kind === "move") handlers.onPointerMove?.(event({ clientY: 80 }));
    if (kind === "cancel") handlers.onPointerCancel?.(press);
    if (kind === "leave") handlers.onPointerLeave?.(press);
    if (kind === "scroll")
      handlers.onWheel?.(press as unknown as React.WheelEvent<HTMLSpanElement>);
    vi.advanceTimersByTime(600);
    handlers.onPointerUp?.(press);
    handlers.onClick?.(press);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onLookup).not.toHaveBeenCalled();
  },
);
it("clears pending lookup when a verse is unmounted", () => {
  const { handlers, onLookup } = word();
  handlers.onPointerDown?.(event());
  effects.cleanup.splice(0).forEach((cleanup) => cleanup());
  vi.advanceTimersByTime(600);
  expect(onLookup).not.toHaveBeenCalled();
});
it("supports word lookup by keyboard", () => {
  const { handlers, onSelect, onLookup } = word();
  handlers.onKeyDown?.({
    key: "Enter",
    repeat: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as React.KeyboardEvent<HTMLSpanElement>);
  expect(onLookup).toHaveBeenCalledOnce();
  expect(onSelect).not.toHaveBeenCalled();
});
