import { expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createContext, Script } from "node:vm";

async function admin() {
  const source = await readFile(
    path.resolve(__dirname, "../public/app.js"),
    "utf8",
  );
  const addButton = { disabled: false };
  const form = { playlistSongs: [], draft: "" };
  const picker = { selectedOptions: [], options: [], value: "" };
  const windowHandlers: Record<string, () => void> = {};
  const modal = {
    open: false,
    innerHTML: "",
    addEventListener() {},
    querySelector(selector: string) {
      return selector === '[data-action="playlist-add"]' ? addButton : null;
    },
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
  };
  const context = createContext({
    document: {
      querySelector: (selector: string) => {
        if (selector === "#dialog") return modal;
        if (selector === "#playlist-form") return form;
        if (selector === "#playlist-song-picker") return picker;
        return { addEventListener() {} };
      },
      querySelectorAll: () => [],
      addEventListener() {},
    },
    window: {
      addEventListener(name: string, handler: () => void) {
        windowHandlers[name] = handler;
      },
    },
    windowHandlers,
    URLSearchParams,
  });
  // Load the real renderer without the ES module import or automatic session request.
  new Script(
    source.slice(0, source.lastIndexOf("\ntry {")).replace(/^import .*;\n/, ""),
  ).runInContext(context);
  new Script('routeName = "playlists";').runInContext(context);
  return <T = string>(expression: string): T =>
    new Script(expression).runInContext(context) as T;
}

const editorSetup = `
  pageData = { revision: 3, items: ["a", "b"].map((id) => ({
    id, titleZh: id, titleEn: id, descriptionZh: "", descriptionEn: "",
    cover: "morning", hymnIds: [], enabled: false,
  })) };
  const requests = [];
  api = () => new Promise((resolve) => requests.push(resolve));
`;

it("keeps the most recently requested playlist editor and its unsaved draft when an older fetch resolves late", async () => {
  const evaluate = await admin();
  evaluate(editorSetup);
  evaluate(
    'const first = playlistDialog("a"); const second = playlistDialog("b");',
  );
  evaluate("requests[1]({items: [], total: 0});");
  await evaluate<Promise<void>>("second");
  evaluate('document.querySelector("#playlist-form").draft = "unsaved B";');
  expect(evaluate("dialog.innerHTML")).toContain('data-key="b"');
  evaluate("requests[0]({items: [], total: 0});");
  await evaluate<Promise<void>>("first");
  expect(evaluate("dialog.innerHTML")).toContain('data-key="b"');
  expect(evaluate('document.querySelector("#playlist-form").draft')).toBe(
    "unsaved B",
  );
});

it("does not reopen a playlist editor after the dialog was closed during its fetch", async () => {
  const evaluate = await admin();
  evaluate(editorSetup);
  evaluate(
    'const pending = playlistDialog("a"); closeDialog(); requests[0]({items: [], total: 0});',
  );
  await evaluate<Promise<void>>("pending");
  expect(evaluate<boolean>("dialog.open")).toBe(false);
});

it("does not replace a later dialog with an older playlist request", async () => {
  const evaluate = await admin();
  evaluate(editorSetup);
  evaluate(
    'const pending = playlistDialog("a"); playlistDeleteDialog("b"); requests[0]({items: [], total: 0});',
  );
  await evaluate<Promise<void>>("pending");
  expect(evaluate("dialog.innerHTML")).toContain("playlist-delete-form");
  expect(evaluate("dialog.innerHTML")).toContain('data-key="b"');
});

it("cancels a pending editor on navigation before loading further hymn pages", async () => {
  const evaluate = await admin();
  evaluate(editorSetup);
  evaluate(
    'const pending = playlistDialog("a"); windowHandlers.hashchange(); requests[0]({items: [], total: 200});',
  );
  await evaluate<Promise<void>>("pending");
  expect(evaluate<boolean>("dialog.open")).toBe(false);
  expect(evaluate<number>("requests.length")).toBe(1);
});

it("renders the cloud playlist page with creation and an empty state", async () => {
  const render = await admin();
  const html = render("playlistPage({revision: 0, items: []})");
  expect(html).toContain("云端歌单");
  expect(html).toContain('data-action="new-playlist"');
  expect(html).toContain("还没有云端歌单");
  expect(html).not.toContain("个人导入");
});

it("escapes playlist metadata and offers edit and delete for published and draft rows", async () => {
  const render = await admin();
  const html = render(
    `playlistPage(${JSON.stringify({
      revision: 3,
      items: [
        {
          id: "morning",
          titleZh: '<img src=x onerror="alert(1)">',
          titleEn: "Praise & Prayer",
          descriptionZh: "<script>bad()</script>",
          descriptionEn: "Quiet",
          cover: "morning",
          enabled: true,
          hymnIds: ["first", "second"],
        },
        {
          id: "lake",
          titleZh: "湖畔",
          titleEn: "Lake",
          descriptionZh: "",
          descriptionEn: "",
          cover: "lake",
          enabled: false,
          hymnIds: [],
        },
      ],
    })})`,
  );
  expect(html).toContain("已发布");
  expect(html).toContain("未发布");
  expect(html).toContain("2 首");
  expect(html).toContain('data-action="edit-playlist"');
  expect(html).toContain('data-action="delete-playlist"');
  expect(html).toContain("&lt;img");
  expect(html).not.toContain("<script>");
});
