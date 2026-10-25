import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const harness = vi.hoisted(() => ({
  state: null as unknown,
  actions: [] as { label: string; onPress: () => void }[],
  dialog: undefined as
    undefined | { visible: boolean; initialSection?: string },
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => [
    harness.state ?? initial,
    (value: unknown) => {
      harness.state = value;
    },
  ],
}));
vi.mock("react-native", () => ({
  View: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  Image: () => null,
  useWindowDimensions: () => ({ width: 320 }),
  Pressable: ({
    children,
    accessibilityLabel,
    onPress,
  }: PropsWithChildren<{
    accessibilityLabel: string;
    onPress: () => void;
  }>) => {
    harness.actions.push({ label: accessibilityLabel, onPress });
    return React.createElement("button", null, children);
  },
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Play",
      "Pause",
      "SkipBack",
      "SkipForward",
      "Repeat",
      "Repeat1",
      "Volume2",
      "ListMusic",
      "AudioLines",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("@react-native-community/slider", () => ({ default: () => null }));
vi.mock("../src/shared/ui", () => ({
  Txt: ({ children }: PropsWithChildren) =>
    React.createElement("span", null, children),
  IconButton: ({ label, onPress }: { label: string; onPress: () => void }) => {
    harness.actions.push({ label, onPress });
    return React.createElement("button", null, label);
  },
}));
vi.mock("../src/shared/theme", () => ({ colors: {}, fonts: {}, images: {} }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (
    select: (state: { bookId: string; chapter: number }) => unknown,
  ) => select({ bookId: "psalms", chapter: 23 }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({ queue: [], rate: 1, repeat: "off" }),
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: (props: typeof harness.dialog) => {
    harness.dialog = props;
    return null;
  },
}));
import { PlayerBar } from "../src/features/audio/PlayerBar";
function render() {
  harness.actions = [];
  renderToStaticMarkup(React.createElement(PlayerBar));
}
beforeEach(() => {
  harness.state = null;
});
it.each([
  ["播放速度，当前 1 倍", "settings"],
  ["播放队列", "queue"],
])("opens %s in its requested section", (label, initialSection) => {
  render();
  harness.actions.find((action) => action.label === label)!.onPress();
  render();
  expect(harness.dialog).toMatchObject({ visible: true, initialSection });
});
