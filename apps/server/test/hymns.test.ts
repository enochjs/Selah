import { afterAll, beforeAll, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
  chmod,
  rename,
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
it("keeps bundled hymns public when optional server preview copies are absent", async () => {
  const file = path.join(root, "media", `${"b".repeat(64)}.mp3`);
  await rename(file, `${file}.held`);
  try {
    const response = await fetch(`${base}/api/hymns`);
    expect(response.status).toBe(200);
    expect(
      (await response.json()).items.map((item: { id: string }) => item.id),
    ).toContain(hymn.id);
  } finally {
    await rename(`${file}.held`, file);
  }
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

async function revision() {
  return (await (await api("/hymns")).json()).revision as number;
}
async function uploadHymn(
  options: {
    authenticated?: boolean;
    csrf?: boolean;
    bytes?: Uint8Array;
    extra?: boolean;
  } = {},
) {
  const form = new FormData();
  for (const [key, value] of Object.entries(edit(await revision()))) {
    if (key !== "id" && key !== "enabled") form.set(key, String(value));
  }
  if (options.extra) form.set("enabled", "true");
  const bytes =
    options.bytes ??
    new Uint8Array(
      await readFile(
        path.resolve(__dirname, "../../app/assets/audio/amazing-grace.mp3"),
      ),
    );
  form.set(
    "audio",
    new Blob([new Uint8Array(bytes)], { type: "audio/mpeg" }),
    "worship.mp3",
  );
  return fetch(`${base}/api/admin/hymns/upload`, {
    method: "POST",
    headers: {
      ...(options.authenticated === false ? {} : { Cookie: cookie }),
      ...(options.csrf === false ? {} : { "X-CSRF-Token": csrf }),
    },
    body: form,
  });
}
let uploadedId: string;
let uploadedPath: string;
it("accepts authenticated MP3 uploads into private pending review, without publishing audio", async () => {
  const response = await uploadHymn();
  expect(response.status).toBe(201);
  const data = await response.json();
  uploadedId = data.item.id;
  uploadedPath = data.item.audioPath;
  expect(data.item).toMatchObject({ reviewStatus: "pending", enabled: false });
  expect(data.item.duration).toBeGreaterThan(1);
  expect((await fetch(`${base}${data.item.audioPath}`)).status).toBe(404);
  const publicList = await fetch(`${base}/api/hymns`);
  expect(publicList.status).toBe(200);
  expect(
    (await publicList.json()).items.some(
      (item: { id: string }) => item.id === uploadedId,
    ),
  ).toBe(false);
  const pending = await (await api("/hymns?reviewStatus=pending")).json();
  expect(pending.items[0]).toMatchObject({
    id: uploadedId,
    audioAvailable: true,
  });
  const anonymous = await fetch(`${base}/api/admin/hymns/${uploadedId}/audio`);
  expect(anonymous.status).toBe(401);
  const preview = await fetch(`${base}/api/admin/hymns/${uploadedId}/audio`, {
    headers: { Cookie: cookie, Range: "bytes=0-3" },
  });
  expect(preview.status).toBe(206);
  expect((await preview.arrayBuffer()).byteLength).toBe(4);
});
it("enforces upload session, CSRF, file validation and unknown-field rejection", async () => {
  expect((await uploadHymn({ authenticated: false })).status).toBe(401);
  expect((await uploadHymn({ csrf: false })).status).toBe(403);
  expect(
    (await uploadHymn({ bytes: new TextEncoder().encode("not an mp3") }))
      .status,
  ).toBe(400);
  expect(
    (await uploadHymn({ bytes: new Uint8Array([0xff, 0xfb, 0x90, 0]) })).status,
  ).toBe(400);
  expect((await uploadHymn({ extra: true })).status).toBe(400);
  expect(
    (await uploadHymn({ bytes: new Uint8Array(30 * 1024 * 1024 + 1) })).status,
  ).toBe(413);
});
it("cannot bypass pending review by enabling a hymn through the editor", async () => {
  const row = (
    await (await api(`/hymns?reviewStatus=pending`)).json()
  ).items.find((item: { id: string }) => item.id === uploadedId);
  expect(
    (
      await api("/hymns", "PUT", {
        ...edit(await revision()),
        id: row.id,
        enabled: true,
      })
    ).status,
  ).toBe(400);
});
it("approves with revision checks and immediately exposes a playable hymn through the public API", async () => {
  const current = await revision();
  // Production mounts Bible media read-only; hymn publishing must use writable admin storage.
  await chmod(path.join(root, "media"), 0o500);
  const responses = await Promise.all([
    api("/hymns/review", "PUT", {
      id: uploadedId,
      revision: current,
      status: "approved",
      note: "试听及授权已核对",
    }),
    api("/hymns/review", "PUT", {
      id: uploadedId,
      revision: current,
      status: "approved",
    }),
  ]);
  await chmod(path.join(root, "media"), 0o700);
  expect(responses.map((response) => response.status).sort()).toEqual([
    200, 409,
  ]);
  const response = await fetch(`${base}/api/hymns`);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const item = (await response.json()).items.find(
    (row: { id: string }) => row.id === uploadedId,
  );
  expect(item).toMatchObject({
    id: uploadedId,
    enabled: true,
    reviewStatus: "approved",
  });
  const audio = await fetch(`${base}${item.audioPath}`, {
    headers: { Range: "bytes=0-3" },
  });
  expect(audio.status).toBe(206);
  expect((await audio.arrayBuffer()).byteLength).toBe(4);
  const head = await fetch(`${base}${item.audioPath}`, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("cache-control")).toBe("no-store");
  expect(
    (
      await fetch(`${base}${item.audioPath}`, {
        headers: { "If-None-Match": head.headers.get("etag")! },
      })
    ).status,
  ).toBe(304);
});
it("withdraws edited uploads until reviewed again and keeps rejected hymns private after restart", async () => {
  expect(
    (
      await api("/hymns", "PUT", {
        ...edit(await revision()),
        id: uploadedId,
        titleZh: "新的诗歌资料",
      })
    ).status,
  ).toBe(200);
  let rows = (await (await fetch(`${base}/api/hymns`)).json()).items;
  expect(rows.some((item: { id: string }) => item.id === uploadedId)).toBe(
    false,
  );
  expect((await fetch(`${base}${uploadedPath}`)).status).toBe(404);
  expect(
    (
      await api("/hymns/review", "PUT", {
        id: uploadedId,
        revision: await revision(),
        status: "rejected",
        note: "请补充授权",
      })
    ).status,
  ).toBe(200);
  await app.close();
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    stateRoot: path.join(root, "state"),
    password: "hymn-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  rows = (await (await fetch(`${base}/api/hymns`)).json()).items;
  expect(rows.some((item: { id: string }) => item.id === uploadedId)).toBe(
    false,
  );
  const saved = JSON.parse(
    await readFile(path.join(root, "content/hymns.json"), "utf8"),
  );
  expect(
    saved.items.find((item: { id: string }) => item.id === uploadedId),
  ).toMatchObject({
    reviewStatus: "rejected",
    reviewNote: "请补充授权",
    enabled: false,
  });
});
