import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";
import { resolveOptions } from "../src/common/options";
let app: Awaited<ReturnType<typeof createApplication>>;
let root: string, base: string, cookie: string, csrf: string;
const password = "secure-test-password";
async function api(route: string, method = "GET", body?: unknown) {
  return fetch(`${base}/api/admin${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookie,
      "X-CSRF-Token": csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-contracts-"));
  const contentRoot = path.join(root, "packages/content/data");
  await mkdir(contentRoot, { recursive: true });
  for (const [name, value] of Object.entries({
    "bible.json": [
      {
        id: "genesis",
        en: "Genesis",
        zh: "创世记",
        testament: "old",
        chapters: [[{ number: 1, en: "In the beginning", zh: "起初" }]],
      },
    ],
    "dictionary.json": {
      grace: { meaning: "恩典", phonetic: "", type: "noun" },
    },
    "chapter-audio.json": {},
    "resource-manifest.json": { importedAt: "2026-10-20" },
  }))
    await writeFile(path.join(contentRoot, name), JSON.stringify(value));
  const checkScript = path.join(root, "check content.mjs");
  await writeFile(
    checkScript,
    "console.log(JSON.stringify(process.argv.slice(2)));",
  );
  const auditRoot = path.join(root, "audits;not-a-command");
  const timingRoot = path.join(root, "timing overrides;not-a-command");
  await mkdir(auditRoot);
  await writeFile(
    path.join(auditRoot, "full-resource-validation.json"),
    '{"ok":true}',
  );
  app = await createApplication({
    contentRoot,
    stateRoot: path.join(root, "storage/admin"),
    auditRoot,
    timingRoot,
    checkScript,
    password,
  });
  await app.listen(0, "127.0.0.1");
  const address = app.getHttpServer().address();
  if (!address || typeof address === "string") throw Error("No address");
  base = `http://127.0.0.1:${address.port}`;
  const login = await api("/login", "POST", { username: "admin", password });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
});
afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("resolves default storage and content paths from the server location", () => {
  const options = resolveOptions();
  const project = path.resolve(__dirname, "../../..");
  expect(options.contentRoot).toBe(path.join(project, "packages/content/data"));
  expect(options.mediaRoot).toBe(path.join(project, "storage/resources/media"));
  expect(options.stateRoot).toBe(path.join(project, "storage/admin"));
  expect(options.publicRoot).toBe(path.join(project, "apps/server/public"));
  expect(options.checkScript).toBe(
    path.join(project, "packages/content/scripts/check-content.mjs"),
  );
});
it("serializes competing dictionary writes and rejects stale revisions", async () => {
  const revision = (await (await api("/dictionary")).json()).revision;
  const results = await Promise.all(
    ["faith", "hope"].map((word) =>
      api("/dictionary", "PUT", {
        word,
        meaning: "含义",
        type: "noun",
        revision,
      }),
    ),
  );
  expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  const state = JSON.parse(
    await readFile(path.join(root, "storage/admin/state.json"), "utf8"),
  );
  expect(state.revision).toBe(revision + 1);
  expect(state.audit).toHaveLength(1);
});
it("rejects unrecognized properties on mutations and pagination queries", async () => {
  expect(
    (
      await api("/reviews", "PUT", {
        key: "genesis:1:1",
        status: "approved",
        note: "",
        unexpected: true,
      })
    ).status,
  ).toBe(400);
  expect((await api("/scripture?pageSize=101")).status).toBe(400);
  expect((await api("/dictionary?unexpected=yes")).status).toBe(400);
  expect(
    (
      await api("/dictionary", "PUT", {
        word: "faith",
        meaning: "x",
        type: "noun",
        revision: "1",
      })
    ).status,
  ).toBe(400);
});
it("reports configured audit and runs the read-only content check without a shell", async () => {
  const system = await (await api("/system")).json();
  expect(system).toMatchObject({
    audit: { ok: true },
    storage: "storage/admin/",
    sessionHours: 8,
    checkRunning: false,
  });
  const checked = await api("/check", "POST", {});
  expect(checked.status).toBe(200);
  const result = await checked.json();
  expect(result.ok).toBe(true);
  expect(JSON.parse(result.output)).toEqual([
    "--content-root",
    path.join(root, "packages/content/data"),
    "--timing-root",
    path.join(root, "timing overrides;not-a-command"),
    "--audit-root",
    path.join(root, "audits;not-a-command"),
  ]);
  const audits = await (await api("/audit")).json();
  expect(audits.items[0].action).toBe("content.check.passed");
});
it("normalizes a null optional review note and rejects non-string notes", async () => {
  const response = await api("/reviews", "PUT", {
    key: "genesis:1:1",
    status: "approved",
    note: null,
  });
  expect(response.status).toBe(200);
  const reviews = await (await api("/reviews")).json();
  expect(reviews.items[0].note).toBe("");
  expect(
    (
      await api("/reviews", "PUT", {
        key: "genesis:1:1",
        status: "approved",
        note: 12,
      })
    ).status,
  ).toBe(400);
});
it("normalizes a null optional phonetic and rejects non-string phonetics", async () => {
  const revision = (await (await api("/dictionary")).json()).revision;
  const response = await api("/dictionary", "PUT", {
    word: "love",
    meaning: "爱",
    type: "noun",
    revision,
    phonetic: null,
  });
  expect(response.status).toBe(200);
  const dictionary = await (await api("/dictionary?q=love")).json();
  expect(dictionary.items[0].phonetic).toBe("");
  expect(
    (
      await api("/dictionary", "PUT", {
        word: "love",
        meaning: "爱",
        type: "noun",
        revision: revision + 1,
        phonetic: 12,
      })
    ).status,
  ).toBe(400);
});
it("checks the configured content directory rather than the bundled canonical copy", async () => {
  const contentRoot = path.join(root, "custom content");
  await mkdir(contentRoot, { recursive: true });
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "dictionary.json": {},
    "chapter-audio.json": {},
    "resource-manifest.json": { versions: { en: { id: "BSB" } } },
  })) {
    await writeFile(path.join(contentRoot, name), JSON.stringify(value));
  }
  const custom = await createApplication({
    contentRoot,
    stateRoot: path.join(root, "custom-admin"),
    timingRoot: path.join(root, "custom timing"),
    auditRoot: path.join(root, "custom audits"),
    checkScript: resolveOptions().checkScript,
    password,
  });
  try {
    await custom.listen(0, "127.0.0.1");
    const address = custom.getHttpServer().address();
    if (!address || typeof address === "string") throw Error("No address");
    const origin = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password }),
    });
    const sessionCookie = login.headers.get("set-cookie")!.split(";")[0];
    const session = await login.json();
    const response = await fetch(`${origin}/api/admin/check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: sessionCookie,
        "X-CSRF-Token": session.csrf,
      },
      body: "{}",
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.ok).toBe(false);
    expect(result.output).not.toContain("Verified 66 books");
  } finally {
    await custom.close();
  }
});
it("sets an eight-hour cookie and expires the session at its deadline", async () => {
  const login = await api("/login", "POST", { username: "admin", password });
  expect(login.status).toBe(200);
  expect(login.headers.get("set-cookie")).toContain("Max-Age=28800");
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 8 * 60 * 60 * 1000 + 1);
  expect((await api("/session")).status).toBe(401);
});
