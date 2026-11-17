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
let root: string, base: string, cookie: string;
const deviceId = "12345678-1234-4234-8234-123456789012";
const event = (id: string, extra = {}) => ({
  id,
  at: Date.now(),
  sessionId: "session-1",
  type: "visit",
  page: "/music",
  seconds: 0,
  ...extra,
});
const send = (events: unknown[], device = deviceId) =>
  fetch(`${base}/api/usage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      deviceId: device,
      platform: "android",
      version: "1.0.0",
      events,
    }),
  });
const dashboard = (days = 7) =>
  fetch(`${base}/api/admin/usage?days=${days}`, {
    headers: { Cookie: cookie },
  });
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-usage-"));
  await mkdir(path.join(root, "content"));
  for (const [file, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", file), JSON.stringify(value));
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    stateRoot: path.join(root, "state"),
    password: "usage-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "usage-test-password",
    }),
  });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("protects the dashboard and starts with a genuine zero-filled history", async () => {
  expect((await fetch(`${base}/api/admin/usage`)).status).toBe(401);
  const response = await dashboard();
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.totals.devices).toBe(0);
  expect(data.daily).toHaveLength(7);
  expect(data.timeZone).toBe("Asia/Shanghai");
  expect((await dashboard(1000)).status).toBe(400);
});
it("counts distinct devices and sessions, deduplicates concurrent retries, and separates foreground from listening", async () => {
  const events = [
    event("visit-1"),
    event("view-1", { type: "view" }),
    event("active-1", { type: "active", seconds: 30 }),
    event("listen-1", {
      type: "listen",
      seconds: 20,
      kind: "hymn",
      contentId: "amazing-grace",
    }),
  ];
  const responses = await Promise.all([
    send(events),
    send(events),
    send([event("visit-2", { sessionId: "session-2" })]),
  ]);
  expect(responses.map((r) => r.status)).toEqual([202, 202, 202]);
  await send([event("visit-1")], "22345678-1234-4234-8234-123456789012");
  const data = await (await dashboard()).json();
  expect(data.totals).toMatchObject({
    devices: 2,
    sessions: 3,
    views: 1,
    activeSeconds: 30,
    hymnSeconds: 20,
    scriptureSeconds: 0,
  });
  expect(data.content[0]).toMatchObject({
    contentId: "amazing-grace",
    seconds: 20,
    devices: 1,
  });
  const folder = path.join(root, "state", "usage");
  const saved = (
    await Promise.all(
      (await readdir(folder))
        .filter((f) => /\.(json|sqlite)(-wal)?$/.test(f))
        .map((f) => readFile(path.join(folder, f), "utf8")),
    )
  ).join("");
  expect(saved).not.toContain(deviceId);
});
it("rejects malformed, future, oversized and sensitive payloads before recording any batch", async () => {
  for (const invalid of [
    event("future", { at: Date.now() + 3600000 }),
    event("long", { seconds: 100000 }),
    event("private", { page: "/bible?search=private" }),
    event("extra", { email: "private@example.com" }),
    event("bad-listen", { type: "listen", seconds: 3 }),
  ])
    expect((await send([invalid])).status).toBe(400);
  expect(
    (await send(Array.from({ length: 51 }, (_, i) => event(`many-${i}`))))
      .status,
  ).toBe(400);
  const preflight = await fetch(`${base}/api/usage`, {
    method: "OPTIONS",
    headers: {
      Origin: "https://app.example",
      "Access-Control-Request-Method": "POST",
    },
  });
  expect(preflight.headers.get("access-control-allow-methods")).toContain(
    "POST",
  );
  expect(preflight.headers.get("access-control-allow-headers")).toContain(
    "Content-Type",
  );
});
