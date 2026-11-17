import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";
import { CredentialsRepository } from "../src/infrastructure/credentials.repository";
import { StateRepository } from "../src/infrastructure/state.repository";

let server: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let base: string;
const password = " original-password-123 ";
const newPassword = " 新-password-456789 ";
type Session = { cookie: string; csrf: string };
let session: Session;
const options = () => ({
  contentRoot: path.join(root, "content"),
  mediaRoot: path.join(root, "media"),
  stateRoot: path.join(root, "admin"),
  password,
});
async function listen() {
  await server.listen(0, "127.0.0.1");
  base = await server.getUrl();
}
async function request(route: string, body?: unknown, auth = session) {
  return fetch(`${base}/api/admin${route}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: auth.cookie,
      "X-CSRF-Token": auth.csrf,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function login(secret = password) {
  const response = await request("/login", {
    username: "admin",
    password: secret,
  });
  const data = await response.json();
  return {
    response,
    cookie: response.headers.get("set-cookie")?.split(";")[0] || "",
    csrf: data.csrf as string,
  };
}
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-password-"));
  await mkdir(path.join(root, "content"));
  await mkdir(path.join(root, "media"));
  for (const [file, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": { versions: {} },
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", file), JSON.stringify(value));
  session = { cookie: "", csrf: "" };
  server = await createApplication(options());
  await listen();
  session = await login();
});
afterEach(async () => {
  vi.restoreAllMocks();
  await server?.close();
  await rm(root, { recursive: true, force: true });
});
it("protects password changes with session, CSRF and same-origin validation", async () => {
  const body = { currentPassword: password, newPassword };
  expect(
    (await request("/password", body, { cookie: "", csrf: "" })).status,
  ).toBe(401);
  expect(
    (await request("/password", body, { ...session, csrf: "" })).status,
  ).toBe(403);
  const foreign = await fetch(`${base}/api/admin/password`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: session.cookie,
      "X-CSRF-Token": session.csrf,
      Origin: "https://foreign.example",
    },
    body: JSON.stringify(body),
  });
  expect(foreign.status).toBe(403);
});
it("validates password lengths, blank values, scalar types and unknown fields", async () => {
  for (const body of [
    { currentPassword: password, newPassword: "short" },
    { currentPassword: password, newPassword: " ".repeat(12) },
    { currentPassword: password, newPassword: "x".repeat(513) },
    { currentPassword: "x".repeat(513), newPassword },
    { currentPassword: "", newPassword },
    { currentPassword: 123, newPassword },
    { currentPassword: password, newPassword: 123 },
    { currentPassword: password },
    { currentPassword: password, newPassword, username: "other" },
  ])
    expect((await request("/password", body)).status).toBe(400);
});
it("rejects an incorrect or unchanged password while preserving the session", async () => {
  expect(
    (await request("/password", { currentPassword: "wrong", newPassword }))
      .status,
  ).toBe(400);
  expect(
    (
      await request("/password", {
        currentPassword: password,
        newPassword: password,
      })
    ).status,
  ).toBe(400);
  expect((await request("/session")).status).toBe(200);
  expect((await login()).response.status).toBe(200);
});
it("throttles current-password guessing", async () => {
  for (let i = 0; i < 5; i++)
    expect(
      (await request("/password", { currentPassword: "wrong", newPassword }))
        .status,
    ).toBe(400);
  expect(
    (await request("/password", { currentPassword: password, newPassword }))
      .status,
  ).toBe(429);
});
it("persists a salted hash, records a secret-free audit and invalidates every session", async () => {
  const other = await login();
  const before = JSON.parse(
    await readFile(path.join(root, "admin/credentials.json"), "utf8"),
  );
  const changed = await request("/password", {
    currentPassword: password,
    newPassword,
  });
  expect(changed.status).toBe(200);
  expect(changed.headers.get("set-cookie")).toContain("Max-Age=0");
  expect(await changed.json()).toEqual({ ok: true });
  expect((await request("/session")).status).toBe(401);
  expect((await request("/session", undefined, other)).status).toBe(401);
  expect((await login()).response.status).toBe(401);
  expect((await login(newPassword)).response.status).toBe(200);
  const saved = await readFile(
    path.join(root, "admin/credentials.json"),
    "utf8",
  );
  expect(JSON.parse(saved)).toMatchObject({ username: "admin" });
  expect(JSON.parse(saved).salt).not.toBe(before.salt);
  expect(JSON.parse(saved).hash).not.toBe(before.hash);
  const state = await readFile(path.join(root, "admin/state.json"), "utf8");
  expect(JSON.parse(state).audit[0]).toMatchObject({
    action: "auth.password.change",
    actor: "admin",
    target: "admin",
  });
  for (const secret of [password, newPassword]) {
    expect(saved).not.toContain(secret);
    expect(state).not.toContain(secret);
  }
  await server.close();
  server = await createApplication(options());
  await listen();
  expect((await login()).response.status).toBe(401);
  expect((await login(newPassword)).response.status).toBe(200);
});
it("allows only one concurrent change using the same authenticated credentials", async () => {
  const responses = await Promise.all([
    request("/password", { currentPassword: password, newPassword }),
    request("/password", {
      currentPassword: password,
      newPassword: "different-new-password",
    }),
  ]);
  expect(responses.filter((r) => r.status === 200)).toHaveLength(1);
  expect(responses.filter((r) => r.status === 401)).toHaveLength(1);
  const state = JSON.parse(
    await readFile(path.join(root, "admin/state.json"), "utf8"),
  );
  expect(
    state.audit.filter(
      (row: { action: string }) => row.action === "auth.password.change",
    ),
  ).toHaveLength(1);
});
it("preserves credentials and sessions when credential persistence fails and permits retry", async () => {
  vi.spyOn(server.get(CredentialsRepository), "write").mockRejectedValueOnce(
    new Error("write failed"),
  );
  expect(
    (await request("/password", { currentPassword: password, newPassword }))
      .status,
  ).toBe(500);
  expect((await login()).response.status).toBe(200);
  expect((await request("/session")).status).toBe(200);
  expect(
    (await request("/password", { currentPassword: password, newPassword }))
      .status,
  ).toBe(200);
});
it("preserves credentials and sessions when audit persistence fails", async () => {
  vi.spyOn(server.get(StateRepository), "update").mockRejectedValueOnce(
    new Error("audit failed"),
  );
  expect(
    (await request("/password", { currentPassword: password, newPassword }))
      .status,
  ).toBe(500);
  expect((await login()).response.status).toBe(200);
  expect((await request("/session")).status).toBe(200);
});
