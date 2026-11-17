import { afterAll, beforeAll, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
  readdir,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";
let app: Awaited<ReturnType<typeof createApplication>>;
let root: string, base: string, cookie: string, csrf: string;
const details = {
  platform: "android",
  channel: "store",
  appId: "app.selah.bible",
  version: "1.1.0",
  buildNumber: 20,
  minSupportedBuild: 1,
  importance: "normal",
  notesZh: "阅读体验改进",
  notesEn: "Reading improvements",
  artifact: null,
  storeUrl: "https://play.google.com/store/apps/details?id=app.selah.bible",
  enabled: false,
};
async function admin(method = "GET", body?: unknown, authenticated = true) {
  return fetch(`${base}/api/admin/app-updates`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authenticated ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
const check = (build = 1) =>
  fetch(
    `${base}/api/app-updates?platform=android&channel=store&buildNumber=${build}`,
  );
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-updates-"));
  await mkdir(path.join(root, "content"));
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    stateRoot: path.join(root, "state"),
    password: "updates-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "updates-test-password",
    }),
  });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("protects administration and validates release metadata and query", async () => {
  expect((await admin("GET", undefined, false)).status).toBe(401);
  expect(await (await check()).json()).toEqual({ release: null });
  expect(
    (
      await fetch(
        `${base}/api/app-updates?platform=ios&channel=direct&buildNumber=1`,
      )
    ).status,
  ).toBe(400);
  for (const fields of [
    { extra: true },
    { buildNumber: 0 },
    { appId: "wrong" },
    { storeUrl: "https://evil.example/file" },
    { artifact: { path: "/evil", size: 1, sha256: "a".repeat(64) } },
    { minSupportedBuild: 21 },
    { notesZh: "" },
    { notesEn: "" },
    { minSupportedBuild: 0 },
    { buildNumber: 2100000001 },
    { version: "1.0.0+metadata" },
    { version: "1.0.0-" + "a".repeat(35) },
  ])
    expect(
      (await admin("PUT", { ...details, ...fields, revision: 0 })).status,
    ).toBe(400);
});
it("keeps drafts private, uses build numbers, rejects stale/downgrade/identity edits, withdraws and audits", async () => {
  const saved = await admin("PUT", { ...details, revision: 0 });
  expect(saved.status).toBe(200);
  const { item } = await saved.json();
  expect(await (await check()).json()).toEqual({ release: null });
  expect(
    (
      await admin("PUT", {
        ...details,
        id: item.id,
        enabled: true,
        revision: 0,
      })
    ).status,
  ).toBe(409);
  const published = await admin("PUT", {
    ...details,
    id: item.id,
    enabled: true,
    revision: 1,
  });
  expect(published.status).toBe(200);
  const result = await check();
  expect(result.headers.get("cache-control")).toBe("no-store");
  const release = (await result.json()).release;
  expect(release.buildNumber).toBe(20);
  expect(release.enabled).toBeUndefined();
  expect(release.publishedAt).toBeTruthy();
  expect(await (await check(20)).json()).toEqual({ release: null });
  expect(
    (
      await admin("PUT", {
        ...details,
        id: item.id,
        version: "1.2.0",
        enabled: true,
        revision: 2,
      })
    ).status,
  ).toBe(409);
  expect(
    (
      await admin("PUT", {
        ...details,
        buildNumber: 19,
        enabled: true,
        revision: 2,
      })
    ).status,
  ).toBe(409);
  expect((await admin("DELETE", { id: item.id, revision: 2 })).status).toBe(
    200,
  );
  expect(await (await check()).json()).toEqual({ release: null });
  const state = JSON.parse(
    await readFile(path.join(root, "state/state.json"), "utf8"),
  );
  expect(
    state.audit.some(
      (row: { action: string }) => row.action === "app-update.save",
    ),
  ).toBe(true);
  expect(
    (await readdir(path.join(root, "state/app-updates/backups"))).length,
  ).toBeGreaterThanOrEqual(3);
});
it("uploads APKs, requires owned artifacts, supports ranges and stops downloads after withdrawal", async () => {
  const bad = new FormData();
  bad.append("file", new Blob(["not an apk"]), "bad.apk");
  expect(
    (
      await fetch(`${base}/api/admin/app-updates/artifacts`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrf },
        body: bad,
      })
    ).status,
  ).toBe(400);
  const form = new FormData();
  form.append(
    "file",
    new Blob([new Uint8Array([80, 75, 3, 4, 1, 2, 3, 4, 5, 6, 7, 8])]),
    "selah.apk",
  );
  const upload = await fetch(`${base}/api/admin/app-updates/artifacts`, {
    method: "POST",
    headers: { Cookie: cookie, "X-CSRF-Token": csrf },
    body: form,
  });
  expect(upload.status).toBe(201);
  const { artifact } = await upload.json();
  const saved = await admin("PUT", {
    ...details,
    channel: "direct",
    artifact,
    storeUrl: null,
    enabled: true,
    revision: 3,
  });
  expect(saved.status).toBe(200);
  const { item } = await saved.json();
  const response = await fetch(`${base}${artifact.path}`, {
    headers: { Range: "bytes=4-7" },
  });
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 4-7/12");
  expect((await response.arrayBuffer()).byteLength).toBe(4);
  const head = await fetch(`${base}${artifact.path}`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe("12");
  expect(
    (
      await fetch(`${base}${artifact.path}`, {
        headers: { "If-None-Match": head.headers.get("etag")! },
      })
    ).status,
  ).toBe(304);
  expect(
    (
      await fetch(`${base}${artifact.path}`, {
        headers: { Range: "bytes=99-" },
      })
    ).status,
  ).toBe(416);
  expect((await admin("DELETE", { id: item.id, revision: 4 })).status).toBe(
    200,
  );
  expect((await fetch(`${base}${artifact.path}`)).status).toBe(404);
});
it("rejects CSRF, cross-origin writes, unknown upload fields and unowned artifacts", async () => {
  const securityHeaders: Record<string, string>[] = [
    { Cookie: cookie },
    { Cookie: cookie, "X-CSRF-Token": csrf, Origin: "https://evil.example" },
  ];
  for (const headers of securityHeaders)
    expect(
      (
        await fetch(`${base}/api/admin/app-updates`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ ...details, revision: 5 }),
        })
      ).status,
    ).toBe(403);
  const forged = {
    path: `/api/app-updates/artifacts/${"a".repeat(64)}.apk`,
    size: 10,
    sha256: "a".repeat(64),
  };
  expect(
    (
      await admin("PUT", {
        ...details,
        channel: "direct",
        buildNumber: 30,
        artifact: forged,
        storeUrl: null,
        revision: 5,
      })
    ).status,
  ).toBe(400);
  const form = new FormData();
  form.append("unexpected", "value");
  expect(
    (
      await fetch(`${base}/api/admin/app-updates/artifacts`, {
        method: "POST",
        headers: { Cookie: cookie, "X-CSRF-Token": csrf },
        body: form,
      })
    ).status,
  ).toBe(400);
  const catalog = await (await admin()).json();
  expect(catalog.revision).toBe(5);
  expect(
    catalog.items.every((item: { enabled: boolean }) => !item.enabled),
  ).toBe(true);
  expect(
    (
      await admin("PUT", {
        ...details,
        buildNumber: 19,
        enabled: true,
        revision: 5,
      })
    ).status,
  ).toBe(409);
});
it("serializes competing revisions and preserves releases after restart", async () => {
  const responses = await Promise.all(
    [31, 32].map((buildNumber) =>
      admin("PUT", { ...details, buildNumber, revision: 5 }),
    ),
  );
  expect(responses.map((row) => row.status).sort()).toEqual([200, 409]);
  await app.close();
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    stateRoot: path.join(root, "state"),
    password: "updates-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const disk = JSON.parse(
    await readFile(path.join(root, "state/app-updates/catalog.json"), "utf8"),
  );
  expect(disk.revision).toBe(6);
  expect(disk.items).toHaveLength(3);
  expect(await (await check()).json()).toEqual({ release: null });
});
