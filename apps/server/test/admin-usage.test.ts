import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createContext, Script } from "node:vm";
async function render(data: unknown) {
  const source = await readFile(
    path.resolve(__dirname, "../public/app.js"),
    "utf8",
  );
  const context = createContext({
    document: {
      querySelector: () => ({ addEventListener() {} }),
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    URLSearchParams,
  });
  new Script(
    source.slice(0, source.lastIndexOf("\ntry {")).replace(/^import .*;\n/, ""),
  ).runInContext(context);
  new Script('routeName = "usage";').runInContext(context);
  return new Script(`usagePage(${JSON.stringify(data)})`).runInContext(
    context,
  ) as string;
}
const empty = {
  days: 7,
  firstEventAt: null,
  generatedAt: new Date().toISOString(),
  totals: {
    devices: 0,
    sessions: 0,
    views: 0,
    activeSeconds: 0,
    hymnSeconds: 0,
    scriptureSeconds: 0,
  },
  daily: [],
  pages: [],
  platforms: [],
  versions: [],
  content: [],
};
it("shows an honest collection empty state, device units and range controls", async () => {
  const html = await render(empty);
  expect(html).toContain("活跃设备");
  expect(html).toContain("等待新版 App 上报");
  expect(html).toContain('value="90"');
  expect(html).toContain("Asia/Shanghai");
  expect(html).not.toContain("注册用户");
});
it("escapes content metadata and exposes daily values alongside the trend", async () => {
  const html = await render({
    ...empty,
    firstEventAt: "2026-11-16T02:00:00Z",
    daily: [
      {
        day: "2026-11-16",
        devices: 2,
        sessions: 3,
        views: 5,
        activeSeconds: 120,
        hymnSeconds: 90,
        scriptureSeconds: 20,
      },
    ],
    content: [
      {
        kind: "hymn",
        contentId: "test",
        title: "<img src=x>",
        seconds: 90,
        devices: 2,
      },
    ],
  });
  expect(html).toContain("&lt;img src=x&gt;");
  expect(html).not.toContain("<img src=x>");
  expect(html).toContain("每日明细");
  expect(html).toContain("2026-11-16");
});
