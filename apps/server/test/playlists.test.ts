import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let app: Awaited<ReturnType<typeof createApplication>>;
let root: string, base: string, cookie: string, csrf: string;
const details = {
  titleZh: " 清晨赞美 ",
  titleEn: " Morning Praise ",
  descriptionZh: "静心聆听",
  descriptionEn: "A quiet moment",
  cover: "morning",
  hymnIds: ["second", "withdrawn", "first", "pending", "unavailable"],
  enabled: true,
};
async function api(
  route = "/playlists",
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
async function start() {
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    stateRoot: path.join(root, "state"),
    mediaRoot: path.join(root, "media"),
    password: "playlist-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await api(
    "/login",
    "POST",
    { username: "admin", password: "playlist-test-password" },
    false,
  );
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
}
async function published() {
  return fetch(`${base}/api/playlists`);
}
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-playlists-"));
  await mkdir(path.join(root, "content"));
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
    "hymns.json": {
      revision: 0,
      items: ["first", "second", "withdrawn", "pending", "unavailable"].map(
        (id) => ({
          id,
          titleZh: id,
          titleEn: id,
          subtitleZh: "诗歌",
          subtitleEn: "Hymn",
          artist: "Artist",
          category: "Hymn",
          source: "Public domain",
          license: "Public domain",
          duration: 10,
          audioPath: `/api/audio/${id === "unavailable" ? "hymns" : "resources"}/${"a".repeat(64)}.mp3`,
          enabled: id !== "withdrawn",
          ...(id === "pending" ? { reviewStatus: "pending" } : {}),
          ...(id === "unavailable"
            ? { uploadedAt: "2026-01-01", reviewStatus: "approved" }
            : {}),
        }),
      ),
    },
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  await start();
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("returns an empty catalog for old content roots and protects admin reads and writes", async () => {
  expect((await published()).status).toBe(200);
  expect(await (await published()).json()).toEqual({ revision: 0, items: [] });
  expect(await (await api()).json()).toEqual({ revision: 0, items: [] });
  expect((await api("/playlists?unexpected=yes")).status).toBe(400);
  expect((await api("/playlists", "GET", undefined, false)).status).toBe(401);
  expect(
    (await api("/playlists", "PUT", { ...details, revision: 0 }, false)).status,
  ).toBe(401);
  expect(
    (
      await fetch(`${base}/api/admin/playlists`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Cookie: cookie },
        body: "{}",
      })
    ).status,
  ).toBe(403);
});
it("rejects invalid, unknown, duplicate and nonexistent song fields", async () => {
  for (const change of [
    { extra: true },
    { titleZh: "  " },
    { titleEn: "" },
    { cover: "other" },
    { enabled: "true" },
    { hymnIds: ["first", "first"] },
    { hymnIds: ["missing"] },
    { hymnIds: ["../file"] },
    { revision: "0" },
    { id: "../file" },
  ]) {
    expect(
      (await api("/playlists", "PUT", { ...details, revision: 0, ...change }))
        .status,
    ).toBe(400);
  }
  expect(
    (await api("/playlists", "PUT", { ...details, revision: 0, id: "missing" }))
      .status,
  ).toBe(404);
});
let id: string;
it("creates a playlist while retaining private song references and publishing only eligible songs in order", async () => {
  const response = await api("/playlists", "PUT", { ...details, revision: 0 });
  expect(response.status).toBe(200);
  const result = await response.json();
  id = result.item.id;
  expect(result).toMatchObject({
    ok: true,
    revision: 1,
    item: {
      titleZh: "清晨赞美",
      titleEn: "Morning Praise",
      hymnIds: details.hymnIds,
    },
  });
  const publicResponse = await published();
  expect(publicResponse.headers.get("cache-control")).toBe("no-store");
  expect(await publicResponse.json()).toEqual({
    revision: 1,
    items: [{ ...result.item, hymnIds: ["second", "first"] }],
  });
  expect(
    JSON.parse(
      await readFile(path.join(root, "state/backups", result.backup), "utf8"),
    ),
  ).toEqual({ revision: 0, items: [] });
});
it("reflects hymn withdrawal without destroying the administrator's song order", async () => {
  const catalog = await (await api("/hymns")).json();
  const song = catalog.items.find(
    (item: { id: string }) => item.id === "second",
  );
  const response = await api("/hymns", "PUT", {
    revision: catalog.revision,
    id: song.id,
    titleZh: song.titleZh,
    titleEn: song.titleEn,
    subtitleZh: song.subtitleZh,
    subtitleEn: song.subtitleEn,
    artist: song.artist,
    category: song.category,
    source: song.source,
    license: song.license,
    enabled: false,
  });
  expect(response.status).toBe(200);
  expect(await (await published()).json()).toMatchObject({
    revision: 1,
    items: [{ hymnIds: ["first"] }],
  });
  expect(await (await api()).json()).toMatchObject({
    revision: 1,
    items: [{ hymnIds: details.hymnIds }],
  });
});
it("serializes competing updates with backups and audit records", async () => {
  const body = { ...details, id, revision: 1, enabled: false };
  const responses = await Promise.all([
    api("/playlists", "PUT", body),
    api("/playlists", "PUT", body),
  ]);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const result = await responses
    .find((response) => response.status === 200)!
    .json();
  expect(await (await published()).json()).toEqual({ revision: 2, items: [] });
  expect(
    JSON.parse(
      await readFile(path.join(root, "state/backups", result.backup), "utf8"),
    ),
  ).toMatchObject({ revision: 1, items: [{ id, enabled: true }] });
  const audit = await (await api("/audit")).json();
  expect(
    audit.items.filter(
      (row: { action: string }) => row.action === "playlist.save",
    ),
  ).toHaveLength(2);
});
it("preserves saved playlists across restart and removes them with revision and security checks", async () => {
  await app.close();
  await start();
  expect(await (await api()).json()).toMatchObject({
    revision: 2,
    items: [{ id, hymnIds: details.hymnIds, enabled: false }],
  });
  expect(
    (await api("/playlists", "DELETE", { id, revision: 2 }, false)).status,
  ).toBe(401);
  const rejectedHeaders: Record<string, string>[] = [
    { Cookie: cookie },
    { Cookie: cookie, "X-CSRF-Token": csrf, Origin: "https://other.example" },
  ];
  for (const headers of rejectedHeaders) {
    expect(
      (
        await fetch(`${base}/api/admin/playlists`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json", ...headers },
          body: JSON.stringify({ id, revision: 2 }),
        })
      ).status,
    ).toBe(403);
  }
  expect((await api("/playlists", "DELETE", { id, revision: 1 })).status).toBe(
    409,
  );
  expect(
    (await api("/playlists", "DELETE", { id, revision: 2, extra: true }))
      .status,
  ).toBe(400);
  expect(
    (await api("/playlists", "DELETE", { id: "missing", revision: 2 })).status,
  ).toBe(404);
  const deleted = await api("/playlists", "DELETE", { id, revision: 2 });
  expect(deleted.status).toBe(200);
  const result = await deleted.json();
  expect(
    JSON.parse(
      await readFile(path.join(root, "state/backups", result.backup), "utf8"),
    ),
  ).toMatchObject({ revision: 2, items: [{ id }] });
  expect(await (await api()).json()).toEqual({ revision: 3, items: [] });
  expect((await (await api("/audit")).json()).items).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "playlist.delete",
        actor: "admin",
        target: id,
      }),
    ]),
  );
  await app.close();
  await start();
  expect(await (await published()).json()).toEqual({ revision: 3, items: [] });
  expect(
    await readFile(path.join(root, "content/chapter-audio.json"), "utf8"),
  ).toBe("{}");
});
