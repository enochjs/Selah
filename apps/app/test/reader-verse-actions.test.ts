import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

type Effect = { deps: unknown[]; cleanup?: void | (() => void) };
const context = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => void)[],
  animations: [] as {
    duration: number;
    toValue: number;
    useNativeDriver: boolean;
    complete?: (result: { finished: boolean }) => void;
  }[],
  reducedMotion: false,
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const index = context.cursor++;
    if (!(index in context.cells))
      context.cells[index] =
        typeof initial === "function" ? initial() : initial;
    return [
      context.cells[index],
      (value: unknown) => {
        context.cells[index] = value;
      },
    ];
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = context.cursor++;
    const previous = context.cells[index] as Effect | undefined;
    if (
      !previous ||
      deps.some((value, i) => !Object.is(value, previous.deps[i]))
    )
      context.effects.push(() => {
        previous?.cleanup?.();
        context.cells[index] = { deps, cleanup: effect() };
      });
  },
}));
vi.mock("react-native", () => {
  const View = ({
    children,
    accessibilityLabel,
    pointerEvents,
  }: PropsWithChildren<{
    accessibilityLabel?: string;
    pointerEvents?: string;
  }>) =>
    React.createElement(
      "div",
      { "aria-label": accessibilityLabel, "data-pointer": pointerEvents },
      children,
    );
  return {
    View,
    Pressable: ({
      children,
      accessibilityLabel,
      disabled,
    }: PropsWithChildren<{
      accessibilityLabel?: string;
      disabled?: boolean;
    }>) =>
      React.createElement(
        "button",
        { "aria-label": accessibilityLabel, disabled },
        children,
      ),
    Platform: { OS: "ios" },
    AccessibilityInfo: {
      isReduceMotionEnabled: async () => context.reducedMotion,
      addEventListener: () => ({ remove: () => {} }),
    },
    Easing: { out: () => {}, in: () => {}, cubic: () => {} },
    Animated: {
      View,
      Value: class {
        interpolate() {
          return 0;
        }
      },
      timing: (
        _value: unknown,
        options: (typeof context.animations)[number],
      ) => {
        const animation = { ...options };
        context.animations.push(animation);
        return {
          start: (complete: (result: { finished: boolean }) => void) => {
            animation.complete = complete;
          },
          stop: () => animation.complete?.({ finished: false }),
        };
      },
    },
  };
});
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    ["Bookmark", "Pause", "Play", "Repeat1", "X"].map((name) => [
      name,
      () => null,
    ]),
  ),
);
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: ({ label }: { label: string }) =>
    React.createElement("button", { "aria-label": label }),
}));
import { ReaderVerseActions } from "../src/features/reader/ReaderVerseActions";

const props = {
  verse: 4,
  reference: "诗篇 23:4",
  saved: false,
  loaded: false,
  playing: false,
  repeating: false,
  playable: true,
  onBookmark: vi.fn(),
  onPlay: vi.fn(),
  onRepeat: vi.fn(),
  onDismiss: vi.fn(),
};
function draw(visible: boolean) {
  context.cursor = 0;
  const html = renderToStaticMarkup(
    React.createElement(ReaderVerseActions, { ...props, visible }),
  );
  context.effects.splice(0).forEach((effect) => effect());
  return html;
}
async function open() {
  draw(true);
  await Promise.resolve();
  draw(true);
  context.animations.at(-1)?.complete?.({ finished: true });
}
beforeEach(() => {
  context.cells = [];
  context.effects = [];
  context.animations = [];
  context.reducedMotion = false;
});
it("does not mount a hidden verse action card", () => {
  expect(draw(false)).toBe("");
});
it("keeps the closing card visible but untouchable until its animation finishes", async () => {
  await open();
  const closing = draw(false);
  expect(closing).toContain('aria-label="经节操作"');
  expect(closing).toContain('data-pointer="none"');
  expect(context.animations.at(-1)?.toValue).toBe(0);
  context.animations.at(-1)?.complete?.({ finished: true });
  expect(draw(false)).toBe("");
});
it("does not let an interrupted close remove a rapidly reopened card", async () => {
  await open();
  draw(false);
  const staleClose = context.animations.at(-1)?.complete;
  draw(true);
  staleClose?.({ finished: true });
  expect(draw(true)).toContain('aria-label="经节操作"');
  expect(context.animations.at(-1)?.toValue).toBe(1);
});
it("respects reduced motion for both entrance and exit", async () => {
  context.reducedMotion = true;
  await open();
  expect(context.animations.at(-1)?.duration).toBe(0);
  draw(false);
  expect(context.animations.at(-1)?.duration).toBe(0);
});
