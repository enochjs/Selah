import React, { type PropsWithChildren, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { DownloadPlan, OfflineState } from "../src/domain/offline-audio";
vi.mock("../src/features/downloads/OfflineHymnsSection", () => ({
  OfflineHymnsSection: () => null,
}));
const ui = vi.hoisted(() => ({
  focused: true,
  cursor: 0,
  cells: [] as unknown[],
  effects: [] as (() => unknown)[],
  cleanups: [] as (() => void)[],
  views: [] as Record<string, unknown>[],
  actions: [] as {
    label: string;
    onPress: () => unknown;
    disabled?: boolean;
    selected?: boolean;
    style?: Record<string, unknown>;
  }[],
  dialogs: [] as {
    title: string;
    visible: boolean;
    dismissible?: boolean;
    onClose: () => void;
    onDismiss?: () => void;
  }[],
  scrolls: [] as string[],
  width: 393,
  interfaceLocale: "zh",
  params: {} as Record<string, string>,
  prepare: vi.fn(),
  enqueue: vi.fn(),
  remove: vi.fn(),
  pause: vi.fn(),
  resume: vi.fn(),
  initializationError: false,
  retryInitialization: vi.fn(),
  state: {} as OfflineState,
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
  useEffect: (effect: () => unknown, deps: unknown[]) => {
    const i = ui.cursor++;
    const previous = ui.cells[i] as unknown[] | undefined;
    if (
      !previous ||
      deps.some((dep, index) => !Object.is(dep, previous[index]))
    ) {
      ui.cells[i] = deps;
      ui.effects.push(effect);
    }
  },
}));
vi.mock("react-native", () => ({
  View: ({
    children,
    style,
  }: PropsWithChildren<{ style?: Record<string, unknown> }>) => {
    if (style) ui.views.push(style);
    return React.createElement("div", null, children);
  },
  ScrollView: ({ children }: PropsWithChildren) => {
    const html = renderToStaticMarkup(
      React.createElement("article", null, children),
    );
    ui.scrolls.push(html);
    return React.createElement("article", {
      dangerouslySetInnerHTML: { __html: html },
    });
  },
  Pressable: ({
    children,
    onPress,
    disabled,
    accessibilityLabel,
    accessibilityState,
    style,
  }: PropsWithChildren<{
    onPress: () => unknown;
    disabled?: boolean;
    accessibilityLabel?: string;
    accessibilityState?: { selected?: boolean };
    style?: Record<string, unknown>;
  }>) => {
    ui.actions.push({
      label:
        accessibilityLabel ??
        renderToStaticMarkup(
          React.createElement("span", null, children),
        ).replace(/<[^>]*>/g, ""),
      onPress,
      disabled,
      selected: accessibilityState?.selected,
      style,
    });
    return React.createElement("button", null, children);
  },
  ActivityIndicator: () => null,
  TextInput: () => React.createElement("input"),
  useWindowDimensions: () => ({ width: ui.width, height: 852 }),
}));
vi.mock("lucide-react-native", () =>
  Object.fromEntries(
    [
      "ArrowLeft",
      "BookOpen",
      "Download",
      "Pause",
      "Play",
      "RefreshCw",
      "Trash2",
      "Wifi",
      "X",
      "Check",
    ].map((name) => [name, () => null]),
  ),
);
vi.mock("expo-router", () => ({
  router: { push: vi.fn() },
  useLocalSearchParams: () => ui.params,
  useIsFocused: () => ui.focused,
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("../src/state/app-store", async (original) => {
  const actual = await original<typeof import("../src/state/app-store")>();
  const store = actual.useAppStore;
  return {
    useAppStore: Object.assign(
      (select: (state: ReturnType<typeof store.getState>) => unknown) =>
        select(store.getState()),
      store,
    ),
  };
});
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({
    bi: (zh: string, en: string) => (ui.interfaceLocale === "zh" ? zh : en),
    locale: ui.interfaceLocale,
  }),
}));
vi.mock("../src/shared/theme", () => ({
  colors: {},
  fonts: {},
  typeScale: { caption: 12, label: 13, body: 14 },
}));
vi.mock("../src/shared/ui", () => {
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
    Panel: ({ children }: PropsWithChildren) =>
      React.createElement("div", null, children),
    Eyebrow: ({ children }: PropsWithChildren) =>
      React.createElement("small", null, children),
    Button,
    Pill: Button,
    inputStyle: {},
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
          | ((controls: {
              onClose: () => void;
              dismissible: boolean;
            }) => ReactNode);
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
  };
});
vi.mock("../src/features/downloads/OfflineAudioProvider", () => ({
  useOfflineAudio: () => ui,
}));
import { OfflineAudioScreen } from "../src/features/downloads/OfflineAudioScreen";
import { useAppStore } from "../src/state/app-store";
const chapter = {
  key: "genesis:1:en",
  bookId: "genesis",
  chapter: 1,
  locale: "en" as const,
  files: [],
  recording: { path: "test.mp3", duration: 30, segments: [] },
};
const plan: DownloadPlan = {
  chapters: [chapter],
  bytes: 1024,
  totalBytes: 4096,
  availableBytes: null,
};
function draw() {
  ui.cursor = 0;
  ui.actions = [];
  ui.dialogs = [];
  ui.scrolls = [];
  ui.views = [];
  const html = renderToStaticMarkup(React.createElement(OfflineAudioScreen));
  ui.effects.splice(0).forEach((effect) => {
    const cleanup = effect();
    if (typeof cleanup === "function") ui.cleanups.push(cleanup as () => void);
  });
  return html;
}
function action(label: string) {
  const found = ui.actions.find((action) => action.label === label);
  if (!found)
    throw new Error(
      `Missing ${label}: ${ui.actions.map((a) => a.label).join(", ")}`,
    );
  return found;
}
async function press(label: string) {
  await action(label).onPress();
  await Promise.resolve();
  await Promise.resolve();
}
function dialog(title: string) {
  return ui.dialogs.find((dialog) => dialog.title === title)!;
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((r, j) => {
    resolve = r;
    reject = j;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  ui.cells = [];
  ui.effects = [];
  ui.cleanups = [];
  ui.width = 393;
  ui.interfaceLocale = "zh";
  ui.params = {};
  ui.focused = true;
  ui.initializationError = false;
  ui.state = {
    ready: true,
    chapters: {},
    assets: {},
    transfers: {},
    network: "wifi",
    wifiOnly: true,
  };
  vi.clearAllMocks();
  ui.prepare.mockResolvedValue(plan);
  ui.enqueue.mockResolvedValue(undefined);
  ui.remove.mockResolvedValue(undefined);
  useAppStore.setState(
    {
      ...useAppStore.getInitialState(),
      primaryLocale: "en",
      words: [],
      reviews: [],
    },
    true,
  );
});
it("waits for the book host to dismiss before showing the prepared confirmation, without enqueueing", async () => {
  draw();
  press("指定书卷");
  draw();
  await press("创世纪");
  draw();
  expect(dialog("选择书卷").visible).toBe(false);
  expect(dialog("确认下载").visible).toBe(false);
  dialog("选择书卷").onDismiss!();
  draw();
  expect(dialog("确认下载").visible).toBe(true);
  dialog("选择书卷").onDismiss!();
  draw();
  expect(ui.enqueue).not.toHaveBeenCalled();
  expect(ui.prepare).toHaveBeenCalledWith(
    { kind: "book", bookId: "genesis" },
    "en",
  );
});
it("locks book preparation immediately and retries failures inside the chooser", async () => {
  const pending = deferred<DownloadPlan>();
  ui.prepare.mockReturnValueOnce(pending.promise);
  draw();
  press("指定书卷");
  draw();
  const select = action("创世纪").onPress;
  const request = select();
  select();
  const html = draw();
  expect(dialog("选择书卷").dismissible).toBe(false);
  expect(html).toContain("正在准备《创世纪》下载信息");
  expect(action("创世纪").disabled).toBe(true);
  expect(action("创世纪").selected).toBe(true);
  expect(action("创世纪").style?.minHeight).toBeGreaterThanOrEqual(44);
  expect(action("创世纪").style?.minWidth).toBeGreaterThanOrEqual(44);
  expect(
    ui.actions.filter((action) => action.label === "新约").at(-1)?.disabled,
  ).toBe(true);
  expect(action("关闭").disabled).toBe(true);
  expect(ui.prepare).toHaveBeenCalledOnce();
  dialog("选择书卷").onClose();
  draw();
  expect(dialog("选择书卷").visible).toBe(true);
  pending.reject(new Error("network"));
  await request;
  expect(draw()).toContain("暂时无法获取下载清单");
  expect(dialog("选择书卷").visible).toBe(true);
  expect(dialog("选择书卷").dismissible).toBe(true);
  await press("重试");
  draw();
  expect(ui.prepare).toHaveBeenCalledTimes(2);
  dialog("选择书卷").onDismiss!();
  draw();
  expect(dialog("确认下载").visible).toBe(true);
});
it("clears an empty preparation locally and never opens an old candidate", async () => {
  ui.prepare.mockResolvedValueOnce({ ...plan, chapters: [] });
  draw();
  press("指定书卷");
  draw();
  await press("创世纪");
  expect(draw()).toContain("此范围暂无可下载的音频");
  expect(dialog("选择书卷").visible).toBe(true);
  dialog("选择书卷").onClose();
  draw();
  dialog("选择书卷").onDismiss!();
  draw();
  expect(dialog("确认下载").visible).toBe(false);
});
it("keeps the footer submit and cancellation fixed while displaying true bytes, totals and unknown storage", async () => {
  draw();
  await press("整部圣经");
  const html = draw();
  expect(html).toMatch(/<footer>[\s\S]*取消[\s\S]*开始下载[\s\S]*<\/footer>/);
  expect(html).toContain("1.0 KB");
  expect(html).toContain("4.0 KB");
  expect(html).toContain("未知");
  expect(ui.enqueue).not.toHaveBeenCalled();
  press("取消");
  draw();
  expect(dialog("确认下载").visible).toBe(false);
  expect(ui.remove).not.toHaveBeenCalled();
});
it("guards duplicate enqueue immediately, locks dismissal and keeps failed confirmation retryable with chosen Wi-Fi policy", async () => {
  draw();
  await press("整部圣经");
  draw();
  await press("仅 Wi-Fi 下载");
  draw();
  const pending = deferred<void>();
  ui.enqueue.mockReturnValueOnce(pending.promise);
  const submit = action("开始下载").onPress;
  const request = submit();
  submit();
  draw();
  expect(ui.enqueue).toHaveBeenCalledExactlyOnceWith(plan, false);
  expect(dialog("确认下载").dismissible).toBe(false);
  expect(action("正在添加…").disabled).toBe(true);
  dialog("确认下载").onClose();
  draw();
  expect(dialog("确认下载").visible).toBe(true);
  pending.reject(new Error("storage"));
  await request;
  expect(draw()).toContain("操作未完成，请重试");
  expect(dialog("确认下载").dismissible).toBe(true);
  await press("开始下载");
  draw();
  expect(ui.enqueue).toHaveBeenCalledTimes(2);
  expect(dialog("确认下载").visible).toBe(false);
});
it("blocks insufficient space and saves already-local 0 B audio without claiming network transfer", async () => {
  ui.prepare.mockResolvedValueOnce({ ...plan, availableBytes: 512 });
  draw();
  await press("整部圣经");
  expect(draw()).toContain("空间不足");
  expect(action("开始下载").disabled).toBe(true);
  press("取消");
  draw();
  ui.prepare.mockResolvedValueOnce({ ...plan, bytes: 0 });
  await press("整部圣经");
  const html = draw();
  expect(html).toContain("无需再次下载");
  expect(html).toContain("0 B");
  await press("保存到离线音频");
  expect(ui.enqueue).toHaveBeenCalledWith({ ...plan, bytes: 0 }, true);
});
it("auto-prepares a requested chapter but never starts the download without confirmation", async () => {
  ui.params = { bookId: "genesis", chapter: "1", locale: "en" };
  draw();
  await Promise.resolve();
  draw();
  expect(ui.prepare).toHaveBeenCalledExactlyOnceWith(
    { kind: "chapter", bookId: "genesis", chapter: 1 },
    "en",
  );
  expect(dialog("确认下载").visible).toBe(true);
  expect(ui.enqueue).not.toHaveBeenCalled();
});
it("cancels book deletion without changing learning data, then guards removal and retries its inline error", async () => {
  ui.state.chapters = { [chapter.key]: { ...chapter, status: "complete" } };
  useAppStore.getState().addWord("faith", "信心", "", "", "note");
  const learning = useAppStore.getState();
  draw();
  press("删除创世纪的英文音频");
  let html = draw();
  expect(html).toContain("经文、生词、收藏和学习记录会保留");
  expect(html).toMatch(
    /<footer>[\s\S]*保留音频[\s\S]*确认删除音频[\s\S]*<\/footer>/,
  );
  press("保留音频");
  draw();
  expect(ui.remove).not.toHaveBeenCalled();
  expect(useAppStore.getState()).toEqual(learning);
  press("删除创世纪的英文音频");
  draw();
  const pending = deferred<void>();
  ui.remove.mockReturnValueOnce(pending.promise);
  const submit = action("确认删除音频").onPress;
  const request = submit();
  submit();
  draw();
  expect(ui.remove).toHaveBeenCalledExactlyOnceWith([chapter.key]);
  expect(dialog("删除书卷音频？").dismissible).toBe(false);
  dialog("删除书卷音频？").onClose();
  draw();
  expect(dialog("删除书卷音频？").visible).toBe(true);
  pending.reject(new Error("test"));
  await request;
  html = draw();
  expect(html).toContain("操作未完成，请重试");
  expect(dialog("删除书卷音频？").visible).toBe(true);
  await press("确认删除音频");
  draw();
  expect(dialog("删除书卷音频？").visible).toBe(false);
  expect(useAppStore.getState()).toEqual(learning);
});

it("keeps testament tabs and preparation outside the sole book scroller, using three or four equal columns", async () => {
  draw();
  await press("指定书卷");
  draw();
  expect(ui.views.some((style) => style.width === `${100 / 3}%`)).toBe(true);
  expect(ui.scrolls).toHaveLength(2); // Page body and chooser body.
  expect(ui.scrolls[1]).not.toContain("新约");
  expect(ui.scrolls[1]).not.toContain("帖撒罗尼迦后书");
  await ui.actions
    .filter((action) => action.label === "新约")
    .at(-1)!
    .onPress();
  expect(draw()).toContain("帖撒罗尼迦后书");
  expect(ui.scrolls[1]).toContain("帖撒罗尼迦后书");
  const pending = deferred<DownloadPlan>();
  ui.prepare.mockReturnValueOnce(pending.promise);
  const request = action("帖撒罗尼迦后书").onPress();
  const html = draw();
  expect(html.indexOf("正在准备《帖撒罗尼迦后书》下载信息")).toBeLessThan(
    html.indexOf("<main>"),
  );
  expect(ui.scrolls[1]).not.toContain("正在准备");
  ui.width = 600;
  draw();
  expect(ui.views.some((style) => style.width === "25%")).toBe(true);
  pending.resolve(plan);
  await request;
});

it("never opens a stale candidate after leaving while preparation is pending", async () => {
  const pending = deferred<DownloadPlan>();
  ui.prepare.mockReturnValueOnce(pending.promise);
  draw();
  await press("指定书卷");
  draw();
  const request = action("创世纪").onPress();
  ui.cleanups.forEach((cleanup) => cleanup());
  pending.resolve(plan);
  await request;
  draw();
  dialog("选择书卷").onDismiss!();
  draw();
  expect(dialog("确认下载").visible).toBe(false);
  expect(ui.enqueue).not.toHaveBeenCalled();
});

it("discards a pending handoff cancelled before dismissal and starts the next chooser fresh", async () => {
  draw();
  await press("指定书卷");
  draw();
  await press("创世纪");
  draw();
  dialog("选择书卷").onClose();
  draw();
  dialog("选择书卷").onDismiss!();
  draw();
  expect(dialog("确认下载").visible).toBe(false);
  await press("指定书卷");
  draw();
  expect(action("创世纪").selected).toBe(false);
  expect(ui.enqueue).not.toHaveBeenCalled();
});

it("keeps download actions unavailable while offline records load", () => {
  ui.state.ready = false;
  const html = draw();
  expect(html).toContain("正在读取离线资料");
  expect(ui.actions.some((action) => action.label === "指定书卷")).toBe(false);
  expect(ui.prepare).not.toHaveBeenCalled();
});
it("keeps offline initialization failures local with a retry action", async () => {
  ui.state.ready = false;
  ui.initializationError = true;
  const html = draw();
  expect(html).toContain("离线资料暂时无法读取");
  await press("重试");
  expect(ui.retryInitialization).toHaveBeenCalledOnce();
  expect(ui.prepare).not.toHaveBeenCalled();
});

it("unmounts transient download confirmation state when leaving the retained route", async () => {
  ui.params = { bookId: "genesis", chapter: "1", locale: "en" };
  draw();
  await Promise.resolve();
  draw();
  expect(dialog("确认下载").visible).toBe(true);
  ui.focused = false;
  expect(draw()).toBe("");
  expect(ui.dialogs).toHaveLength(0);
  expect(ui.enqueue).not.toHaveBeenCalled();
});
