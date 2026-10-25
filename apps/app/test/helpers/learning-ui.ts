import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { vi } from "vitest";
const ui = vi.hoisted(() => ({
  cursor: 0,
  cells: [] as unknown[],
  actions: [] as {
    label: string;
    onPress: () => unknown;
    disabled?: boolean;
  }[],
  inputs: [] as {
    accessibilityLabel: string;
    onChangeText: (value: string) => void;
    onSubmitEditing?: () => void;
  }[],
  dialogs: [] as {
    title: string;
    visible: boolean;
    onClose: () => void;
    onDismiss?: () => void;
    dismissible?: boolean;
    heightMode?: string;
  }[],
  scrolls: [] as string[],
  push: vi.fn(),
  deleteAudio: vi.fn(),
  toggle: vi.fn(),
  lookupStatus: "found" as "found" | "loading" | "error" | "missing",
  meaning: "家庭",
  width: 393,
  height: 852,
  locale: "zh",
}));
vi.mock("react", async (original) => ({
  ...(await original<typeof React>()),
  useState: (initial: unknown) => {
    const i = ui.cursor++;
    if (!(i in ui.cells))
      ui.cells[i] = typeof initial === "function" ? initial() : initial;
    return [
      ui.cells[i],
      (next: unknown) => {
        ui.cells[i] = typeof next === "function" ? next(ui.cells[i]) : next;
      },
    ];
  },
  useRef: (initial: unknown) => {
    const i = ui.cursor++;
    if (!(i in ui.cells)) ui.cells[i] = { current: initial };
    return ui.cells[i];
  },
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    accessibilityRole,
    accessibilityLabel,
  }: PropsWithChildren<{
    accessibilityRole?: string;
    accessibilityLabel?: string;
  }>) =>
    React.createElement(
      "div",
      { role: accessibilityRole, "aria-label": accessibilityLabel },
      children,
    ),
  ScrollView: ({ children }: PropsWithChildren) => {
    const html = renderToStaticMarkup(
      React.createElement("article", null, children),
    );
    ui.scrolls.push(html);
    return React.createElement("article", {
      dangerouslySetInnerHTML: { __html: html },
    });
  },
  TextInput: (props: (typeof ui.inputs)[number]) => {
    ui.inputs.push(props);
    return React.createElement("input");
  },
  Pressable: ({
    children,
    onPress,
    accessibilityLabel,
    disabled,
    accessibilityRole,
    accessibilityState,
    "aria-checked": ariaChecked,
  }: PropsWithChildren<{
    onPress: () => unknown;
    accessibilityLabel?: string;
    disabled?: boolean;
    accessibilityRole?: string;
    accessibilityState?: { checked?: boolean };
    "aria-checked"?: boolean;
  }>) => {
    ui.actions.push({
      label:
        accessibilityLabel ??
        renderToStaticMarkup(
          React.createElement("span", null, children),
        ).replace(/<[^>]*>/g, ""),
      onPress,
      disabled,
    });
    return React.createElement(
      "button",
      {
        role: accessibilityRole,
        "aria-label": accessibilityLabel,
        "aria-checked": ariaChecked ?? accessibilityState?.checked,
      },
      children,
    );
  },
  useWindowDimensions: () => ({ width: ui.width, height: ui.height }),
  Linking: { openURL: vi.fn() },
  Image: () => null,
  ImageBackground: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
  ActivityIndicator: () => null,
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "Search",
      "Plus",
      "ArrowUpRight",
      "BookMarked",
      "Trash2",
      "Headphones",
      "CalendarDays",
      "Sprout",
      "ArrowRight",
      "Check",
      "Eye",
      "X",
      "Settings2",
      "BookOpen",
      "ChevronDown",
      "ChevronUp",
      "Info",
      "PencilLine",
      "Play",
      "Pause",
      "Music2",
      "Download",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("expo-router", () => ({ router: { push: ui.push } }));
vi.mock("expo-linear-gradient", () => ({
  LinearGradient: ({ children }: PropsWithChildren) =>
    React.createElement("div", null, children),
}));
vi.mock("expo-document-picker", () => ({ getDocumentAsync: vi.fn() }));
vi.mock("../../src/shared/i18n", () => ({
  useI18n: () => ({
    bi: (zh: string, en: string) => (ui.locale === "en" ? en : zh),
    locale: ui.locale,
  }),
}));
vi.mock("../../src/shared/ui", () => {
  const Button = ({
    children,
    onPress,
    disabled,
  }: PropsWithChildren<{ onPress: () => unknown; disabled?: boolean }>) => {
    ui.actions.push({
      label: React.Children.toArray(children).join(""),
      onPress,
      disabled,
    });
    return React.createElement("button", null, children);
  };
  return {
    Txt: ({ children }: PropsWithChildren) =>
      React.createElement("span", null, children),
    Eyebrow: ({ children }: PropsWithChildren) =>
      React.createElement("small", null, children),
    Panel: ({ children }: PropsWithChildren) =>
      React.createElement("div", null, children),
    Button,
    Pill: Button,
    IconButton: ({
      label,
      onPress,
      disabled,
    }: {
      label: string;
      onPress: () => unknown;
      disabled?: boolean;
    }) => {
      ui.actions.push({ label, onPress, disabled });
      return React.createElement("button", null, label);
    },
    Dialog: ({
      children,
      header,
      footer,
      ...props
    }: PropsWithChildren<
      (typeof ui.dialogs)[number] & {
        header?:
          | ReactNode
          | ((p: { onClose: () => void; dismissible: boolean }) => ReactNode);
        footer?: ReactNode;
      }
    >) => {
      ui.dialogs.push(props);
      if (!props.visible) return null;
      return React.createElement(
        "section",
        null,
        typeof header === "function"
          ? header({
              onClose: props.onClose,
              dismissible: props.dismissible !== false,
            })
          : (header ?? props.title),
        React.createElement("main", null, children),
        React.createElement("footer", null, footer),
      );
    },
    inputStyle: {},
  };
});
vi.mock("../../src/state/app-store", async (original) => {
  const actual = await original<typeof import("../../src/state/app-store")>();
  const store = actual.useAppStore;
  return {
    useAppStore: Object.assign(
      (select: (s: ReturnType<typeof store.getState>) => unknown) =>
        select(store.getState()),
      store,
    ),
  };
});
vi.mock("../../src/features/audio/AudioProvider", () => ({
  useAudio: () => ({
    playQueue: vi.fn(),
    setRepeat: vi.fn(),
    track: { id: "song-1" },
    playing: true,
    toggle: ui.toggle,
  }),
}));
vi.mock("../../src/features/audio/media-storage", () => ({
  audioUri: vi.fn(),
  saveAudio: vi.fn(),
  deleteAudio: ui.deleteAudio,
}));
vi.mock("../../src/features/vocabulary/useWordLookup", () => ({
  useWordLookup: () => ({
    entry:
      ui.lookupStatus === "found"
        ? {
            word: "family",
            lemma: "family",
            phonetic: "/family/",
            type: "noun",
            meaning: ui.meaning,
            source: "ECDICT",
            language: "zh",
          }
        : null,
    status: ui.lookupStatus,
    retry: vi.fn(),
  }),
}));
vi.mock("../../src/features/vocabulary/WordPronunciationButton", () => ({
  WordPronunciationButton: ({ compact = false }: { compact?: boolean }) =>
    React.createElement(
      "button",
      { "data-pronunciation": compact ? "compact" : "full" },
      "Pronounce",
    ),
}));
export function draw(element: ReactNode) {
  ui.cursor = 0;
  ui.actions = [];
  ui.inputs = [];
  ui.dialogs = [];
  ui.scrolls = [];
  return renderToStaticMarkup(element);
}
export function press(label: string) {
  const action = ui.actions.find((a) => a.label === label);
  if (!action)
    throw new Error(
      "Missing action " +
        label +
        "; available: " +
        ui.actions.map((a) => a.label).join(", "),
    );
  return action.onPress();
}
export function resetUI() {
  ui.cells = [];
  ui.cursor = 0;
  vi.clearAllMocks();
  ui.lookupStatus = "found";
  ui.meaning = "家庭";
  ui.width = 393;
  ui.height = 852;
  ui.locale = "zh";
}

export { ui };

vi.mock("../../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  images: {},
  typeScale: { caption: 12, label: 13, body: 14 },
}));
vi.mock("../../src/features/audio/catalog", () => ({
  chapterTracks: () => [],
  hymns: () => [],
  customTrack: () => null,
}));

vi.mock("../../src/features/audio/useHymns", () => ({ useHymns: () => [] }));
