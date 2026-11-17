import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createContext, Script } from "node:vm";
async function admin() {
  const source = await readFile(
    path.resolve(__dirname, "../public/app.js"),
    "utf8",
  );
  const form = { release: undefined };
  const modal = {
    open: false,
    innerHTML: "",
    addEventListener() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelector() {
      return null;
    },
  };
  const context = createContext({
    document: {
      querySelector: (selector: string) =>
        selector === "#dialog"
          ? modal
          : selector === "#app-update-form"
            ? form
            : { addEventListener() {} },
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: { addEventListener() {} },
    URLSearchParams,
  });
  new Script(
    source.slice(0, source.lastIndexOf("\ntry {")).replace(/^import .*;\n/, ""),
  ).runInContext(context);
  new Script('routeName="app-updates";').runInContext(context);
  return <T = string>(expression: string): T =>
    new Script(expression).runInContext(context) as T;
}
const row = {
  id: "release-a",
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "1.0.0",
  buildNumber: 10,
  minSupportedBuild: 1,
  importance: "normal",
  notesZh: "<script>bad()</script>",
  notesEn: "",
  enabled: false,
  publishedAt: "",
  storeUrl: null,
  artifact: {
    path: "/api/app-updates/artifacts/hash.apk",
    size: 100,
    sha256: "a".repeat(64),
  },
};
it("renders drafts, publication and withdrawal actions with escaped notes", async () => {
  const evaluate = await admin();
  const empty = evaluate("appUpdatesPage({revision:0,items:[]})");
  expect(empty).toContain("还没有 App 版本");
  expect(empty).toContain('data-action="new-app-update"');
  const html = evaluate(
    `appUpdatesPage(${JSON.stringify({ revision: 1, items: [row, { ...row, id: "release-b", enabled: true }] })})`,
  );
  expect(html).toContain('data-action="publish-app-update"');
  expect(html).toContain('data-action="withdraw-app-update"');
  expect(html).toContain("&lt;script&gt;");
  expect(html).not.toContain("<script>");
});
it("captures editor revision, preserves drafts and locks published identity fields", async () => {
  const evaluate = await admin();
  evaluate(
    `pageData=${JSON.stringify({ revision: 7, items: [{ ...row, publishedAt: "2026-11-16T00:00:00Z" }] })}`,
  );
  evaluate('appUpdateDialog("release-a")');
  const html = evaluate("dialog.innerHTML");
  expect(html).toContain('data-revision="7"');
  expect(html).toContain('name="version" type="text" value="1.0.0" readonly');
  expect(html).toContain('name="platform" disabled');
  expect(html).toContain('name="storeUrl" type="url" value="" readonly');
  expect(html).toContain("保存资料");
  expect(html).not.toContain("确认发布");
  expect(
    evaluate<{ buildNumber: number }>(
      'document.querySelector("#app-update-form").release',
    ).buildNumber,
  ).toBe(10);
});
