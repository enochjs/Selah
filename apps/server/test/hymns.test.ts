import { afterAll, beforeAll, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let app: Awaited<ReturnType<typeof createApplication>>;
let root: string, base: string, cookie: string, csrf: string;
const audioPath = `/api/audio/resources/${"b".repeat(64)}.mp3`;
const hymn = {
  id: "amazing-grace",
  titleZh: "奇异恩典",
  titleEn: "Amazing Grace",
  subtitleZh: "传统赞美诗 · 钢琴音色纯音乐",
  subtitleEn: "Traditional hymn · Piano instrumental",
  artist: "Selah 合成演奏",
  category: "纯音乐",
  source: "公版旋律 · 原创合成演奏",
  license: "旋律为公版，录音为项目合成演奏",
  duration: 65,
  audioPath,
  enabled: true,
};
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
  root = await mkdtemp(path.join(tmpdir(), "selah-hymns-"));
  await mkdir(path.join(root, "content"));
  await mkdir(path.join(root, "media"));
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
    "hymns.json": {
      revision: 0,
      items: [
        hymn,
        {
          ...hymn,
          id: "doxology",
          titleZh: "三一颂",
          titleEn: "Doxology",
          enabled: false,
          audioPath: `/api/audio/resources/${"c".repeat(64)}.mp3`,
        },
      ],
    },
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  // One complete MPEG-1 Layer III frame, as used by the media availability check.
  const frame = Buffer.alloc(417);
  frame.set([0xff, 0xfb, 0x90, 0x00]);
  await writeFile(path.join(root, "media", `${"b".repeat(64)}.mp3`), frame);
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    stateRoot: path.join(root, "state"),
    password: "hymn-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await api(
    "/login",
    "POST",
    { username: "admin", password: "hymn-test-password" },
    false,
  );
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("protects hymn data and changes with the existing session and CSRF policy", async () => {
  expect((await api("/hymns", "GET", undefined, false)).status).toBe(401);
  const response = await fetch(`${base}/api/admin/hymns`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: "{}",
  });
  expect(response.status).toBe(403);
});
it("keeps hymn search, filters and counts separate from Bible recordings", async () => {
  const response = await api("/hymns?q=grace&status=enabled&category=纯音乐");
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.total).toBe(1);
  expect(data.items[0]).toMatchObject({ id: hymn.id, audioAvailable: true });
  expect(data.counts).toEqual({
    total: 2,
    enabled: 1,
    disabled: 1,
    audioAvailable: 1,
  });
  const disabled = await (await api("/hymns?status=disabled")).json();
  expect(disabled.items[0]).toMatchObject({
    id: "doxology",
    audioAvailable: false,
  });
  expect((await (await api("/recordings")).json()).total).toBe(0);
  const overview = await (await api("/overview")).json();
  expect(overview.counts.recordings).toBe(0);
  expect(overview.hymns).toEqual(data.counts);
});
it("retains range, HEAD and conditional audio requests for hymn previews", async () => {
  const head = await fetch(`${base}${audioPath}`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe("417");
  const ranged = await fetch(`${base}${audioPath}`, {
    headers: { Range: "bytes=0-3" },
  });
  expect(ranged.status).toBe(206);
  expect((await ranged.arrayBuffer()).byteLength).toBe(4);
  expect(
    (
      await fetch(`${base}${audioPath}`, {
        headers: { "If-None-Match": head.headers.get("etag")! },
      })
    ).status,
  ).toBe(304);
});
function edit(revision: number) {
  const { duration: _duration, audioPath: _audioPath, ...fields } = hymn;
  void _duration;
  void _audioPath;
  return { ...fields, revision, titleZh: "奇异恩典（钢琴）", enabled: false };
}
it("validates writes and prevents edits to immutable media paths", async () => {
  expect((await api("/hymns?status=unknown")).status).toBe(400);
  expect(
    (await api("/hymns", "PUT", { ...edit(0), audioPath: "/etc/passwd" }))
      .status,
  ).toBe(400);
  expect(
    (await api("/hymns", "PUT", { ...edit(0), titleZh: "  " })).status,
  ).toBe(400);
  expect(
    (await api("/hymns", "PUT", { ...edit(0), enabled: "false" })).status,
  ).toBe(400);
  expect(
    (await api("/hymns", "PUT", { ...edit(0), id: "missing" })).status,
  ).toBe(404);
});
it("serializes competing edits, backs up the catalog and records the change", async () => {
  const responses = await Promise.all([
    api("/hymns", "PUT", edit(0)),
    api("/hymns", "PUT", edit(0)),
  ]);
  expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
  const saved = JSON.parse(
    await readFile(path.join(root, "content/hymns.json"), "utf8"),
  );
  expect(saved).toMatchObject({ revision: 1 });
  expect(saved.items[0]).toMatchObject({
    titleZh: "奇异恩典（钢琴）",
    enabled: false,
    audioPath,
  });
  const backups = await readdir(path.join(root, "state/backups"));
  expect(backups).toHaveLength(1);
  expect(
    JSON.parse(
      await readFile(path.join(root, "state/backups", backups[0]), "utf8"),
    ).items[0],
  ).toEqual(hymn);
  const logs = await (await api("/audit")).json();
  expect(
    logs.items.filter(
      (item: { action: string }) => item.action === "hymn.save",
    ),
  ).toHaveLength(1);
});
it("reads saved hymn edits after recreating the server without altering Bible or personal data", async () => {
  await app.close();
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    stateRoot: path.join(root, "state"),
    password: "hymn-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await api(
    "/login",
    "POST",
    { username: "admin", password: "hymn-test-password" },
    false,
  );
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
  const data = await (await api("/hymns?q=钢琴")).json();
  expect(data.items[0]).toMatchObject({
    titleZh: "奇异恩典（钢琴）",
    enabled: false,
  });
  expect(
    await readFile(path.join(root, "content/chapter-audio.json"), "utf8"),
  ).toBe("{}");
});
