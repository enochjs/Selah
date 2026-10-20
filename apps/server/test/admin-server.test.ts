import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let server: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let base: string;
let cookie = "";
let csrf = "";
let revision = 0;
const password = " test-admin-password-123 ";
async function api(
  route: string,
  method = "GET",
  body?: unknown,
  authenticated = true,
) {
  return fetch(`${base}/api/admin${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-admin-"));
  await mkdir(path.join(root, "packages/content/data"), { recursive: true });
  await mkdir(path.join(root, "storage/resources/media"), { recursive: true });
  const fixtures = {
    "bible.json": [
      {
        id: "genesis",
        zh: "创世记",
        en: "Genesis",
        testament: "old",
        chapters: [[{ number: 1, en: "In the beginning", zh: "起初" }]],
      },
    ],
    "chapter-audio.json": {
      "genesis:1:en": {
        duration: 10,
        path: `/api/audio/resources/${"a".repeat(64)}.mp3`,
        segments: [[1, 0, 10]],
        timingQuality: "provider-timing",
        alignmentStatus: "aligned",
      },
    },
    "resource-manifest.json": {
      importedAt: "2026-10-20T00:00:00Z",
      versions: { en: { id: "BSB" }, zh: { id: "CUVs" } },
    },
    "dictionary.json": {
      grace: { meaning: "恩典", phonetic: "/greɪs/", type: "noun" },
    },
  };
  for (const [name, value] of Object.entries(fixtures))
    await writeFile(
      path.join(root, "packages/content/data", name),
      JSON.stringify(value),
    );
  await writeFile(
    path.join(root, "storage/resources/media", `${"a".repeat(64)}.mp3`),
    "audio-test",
  );
  server = await createApplication({
    contentRoot: path.join(root, "packages/content/data"),
    mediaRoot: path.join(root, "storage/resources/media"),
    stateRoot: path.join(root, "storage/admin"),
    password,
  });
  await new Promise<void>((resolve) =>
    server.getHttpServer().listen(0, "127.0.0.1", resolve),
  );
  const address = server.getHttpServer().address();
  if (!address || typeof address === "string") throw new Error("No address");
  base = `http://127.0.0.1:${address.port}`;
});
afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("serves the admin shell but protects data and mutation endpoints", async () => {
  expect((await fetch(`${base}/admin/`)).status).toBe(200);
  expect((await api("/overview", "GET", undefined, false)).status).toBe(401);
  expect((await api("/dictionary", "PUT", {}, false)).status).toBe(401);
});
it("rejects invalid credentials and establishes an HttpOnly session", async () => {
  expect(
    (
      await api(
        "/login",
        "POST",
        { username: "admin", password: "wrong" },
        false,
      )
    ).status,
  ).toBe(401);
  const response = await api(
    "/login",
    "POST",
    { username: "admin", password },
    false,
  );
  expect(response.status).toBe(200);
  const setCookie = response.headers.get("set-cookie")!;
  expect(setCookie).toContain("HttpOnly");
  expect(setCookie).toContain("SameSite=Strict");
  cookie = setCookie.split(";")[0];
  csrf = (await response.json()).csrf;
  expect(csrf.length).toBeGreaterThan(20);
});
it("requires CSRF protection and refuses foreign origins", async () => {
  expect(
    (
      await fetch(`${base}/api/admin/reviews`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: {
          Origin: "https://foreign.example",
          "Content-Type": "application/json",
        },
        body: "{}",
      })
    ).status,
  ).toBe(403);
});
it("reports real content counts and paginates search and recordings", async () => {
  const overview = await (await api("/overview")).json();
  expect(overview.counts).toMatchObject({
    books: 1,
    chapters: 1,
    verses: 1,
    recordings: 1,
  });
  expect((await (await api("/scripture?q=起初")).json()).total).toBe(1);
  expect((await (await api("/scripture?q=absent")).json()).total).toBe(0);
  expect((await (await api("/scripture?q=Genesis%201%3A1")).json()).total).toBe(
    1,
  );
  expect(
    (
      await (
        await api("/scripture?q=" + encodeURIComponent("创世记1:1"))
      ).json()
    ).total,
  ).toBe(1);
  expect((await (await api("/recordings?locale=en")).json()).total).toBe(1);
  expect((await (await api("/recordings?locale=zh")).json()).total).toBe(0);
  expect((await api("/scripture?page=bad")).status).toBe(400);
  const audio = await fetch(
    `${base}/api/audio/resources/${"a".repeat(64)}.mp3`,
    { headers: { Range: "bytes=0-4" } },
  );
  expect(audio.status).toBe(206);
  expect(await audio.text()).toBe("audio");
});
it("saves review notes durably without altering source scripture", async () => {
  const response = await api("/reviews", "PUT", {
    key: "genesis:1:1",
    status: "flagged",
    note: "核对发音",
  });
  expect(response.status).toBe(200);
  const reviews = await (await api("/reviews")).json();
  expect(reviews.items[0]).toMatchObject({
    key: "genesis:1:1",
    status: "flagged",
    note: "核对发音",
  });
  const state = JSON.parse(
    await readFile(path.join(root, "storage/admin/state.json"), "utf8"),
  );
  expect(state.reviews["genesis:1:1"].note).toBe("核对发音");
  expect(
    (
      await api("/reviews", "PUT", {
        key: "genesis:99:1",
        status: "flagged",
        note: "x",
      })
    ).status,
  ).toBe(400);
  expect(
    (await api("/reviews", "PUT", { key: "genesis:1:1", status: "invalid" }))
      .status,
  ).toBe(400);
});
it("validates dictionary edits and detects stale writes", async () => {
  const initial = await (await api("/dictionary")).json();
  revision = initial.revision;
  expect(
    (
      await api("/dictionary", "PUT", {
        word: "__proto__",
        meaning: "x",
        phonetic: "",
        type: "noun",
        revision,
      })
    ).status,
  ).toBe(400);
  const saved = await api("/dictionary", "PUT", {
    word: "faith",
    meaning: "信心",
    phonetic: "/feɪθ/",
    type: "noun",
    revision,
  });
  expect(saved.status).toBe(200);
  expect(
    (
      await api("/dictionary", "PUT", {
        word: "faith",
        meaning: "旧内容",
        phonetic: "",
        type: "noun",
        revision,
      })
    ).status,
  ).toBe(409);
  revision = (await saved.json()).revision;
  const stored = await (await api("/dictionary?q=faith")).json();
  expect(stored.items[0].meaning).toBe("信心");
  expect(stored.dirty).toBe(true);
  const source = JSON.parse(
    await readFile(
      path.join(root, "packages/content/data/dictionary.json"),
      "utf8",
    ),
  );
  expect(source.faith).toBeUndefined();
});
it("publishes dictionary to the app source with a backup and audit record", async () => {
  const response = await api("/dictionary/publish", "POST", { revision });
  expect(response.status).toBe(200);
  const source = JSON.parse(
    await readFile(
      path.join(root, "packages/content/data/dictionary.json"),
      "utf8",
    ),
  );
  expect(source.faith.meaning).toBe("信心");
  expect((await (await api("/dictionary")).json()).dirty).toBe(false);
  const logs = await (await api("/audit")).json();
  expect(
    logs.items.some(
      (item: { action: string }) => item.action === "dictionary.publish",
    ),
  ).toBe(true);
  const backup = (await response.json()).backup;
  expect(
    JSON.parse(
      await readFile(path.join(root, "storage/admin/backups", backup), "utf8"),
    ).faith,
  ).toBeUndefined();
});
it("deletes a dictionary draft and exports an authenticated backup", async () => {
  const response = await api("/dictionary", "DELETE", {
    word: "faith",
    revision,
  });
  expect(response.status).toBe(200);
  expect((await (await api("/dictionary?q=faith")).json()).total).toBe(0);
  const exported = await api("/export");
  expect(exported.headers.get("content-disposition")).toContain("attachment");
  expect((await exported.json()).reviews["genesis:1:1"].note).toBe("核对发音");
});
it("invalidates the session on logout", async () => {
  expect((await api("/logout", "POST", {})).status).toBe(200);
  expect((await api("/overview")).status).toBe(401);
});

it("rate limits repeated failed logins", async () => {
  for (let attempt = 0; attempt < 5; attempt++)
    expect(
      (
        await api(
          "/login",
          "POST",
          { username: "admin", password: "wrong" },
          false,
        )
      ).status,
    ).toBe(401);
  expect(
    (await api("/login", "POST", { username: "admin", password }, false))
      .status,
  ).toBe(429);
});

it("retains hashed credentials and review data after recreating the service", async () => {
  const credentials = await readFile(
    path.join(root, "storage/admin/credentials.json"),
    "utf8",
  );
  expect(credentials).not.toContain(password);
  expect(JSON.parse(credentials).hash).toHaveLength(128);
  const restarted = await createApplication({
    contentRoot: path.join(root, "packages/content/data"),
    mediaRoot: path.join(root, "storage/resources/media"),
    stateRoot: path.join(root, "storage/admin"),
    password: "ignored-after-initialization",
  });
  await new Promise<void>((resolve) =>
    restarted.getHttpServer().listen(0, "127.0.0.1", resolve),
  );
  try {
    const address = restarted.getHttpServer().address();
    if (!address || typeof address === "string") throw new Error("No address");
    const origin = `http://127.0.0.1:${address.port}`;
    const login = await fetch(`${origin}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "admin", password }),
    });
    expect(login.status).toBe(200);
    const response = await fetch(`${origin}/api/admin/reviews`, {
      headers: { Cookie: login.headers.get("set-cookie")!.split(";")[0] },
    });
    expect((await response.json()).items[0].note).toBe("核对发音");
  } finally {
    await restarted.close();
  }
});

it("rejects unknown DTO fields, scalar coercion and invalid JSON payloads", async () => {
  expect(
    (
      await api(
        "/login",
        "POST",
        { username: "admin", password, admin: true },
        false,
      )
    ).status,
  ).toBe(400);
  expect(
    (await api("/login", "POST", { username: 12, password }, false)).status,
  ).toBe(400);
  expect((await api("/login", "POST", [], false)).status).toBe(400);
  expect(
    (
      await api(
        "/login",
        "POST",
        { username: "admin", password: "a".repeat(33000) },
        false,
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await fetch(`${base}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "{}",
      })
    ).status,
  ).toBe(415);
});
it("protects its static shell and does not expose server files", async () => {
  const response = await fetch(`${base}/admin/`);
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("content-security-policy")).toContain(
    "frame-ancestors 'none'",
  );
  expect((await fetch(`${base}/admin/package.json`)).status).toBe(404);
});
