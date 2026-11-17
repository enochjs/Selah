import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let app: Awaited<ReturnType<typeof createApplication>>;
let root: string, base: string;
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-website-"));
  const contentRoot = path.join(root, "content");
  await mkdir(contentRoot);
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(contentRoot, name), JSON.stringify(value));
  app = await createApplication({
    contentRoot,
    stateRoot: path.join(root, "state"),
    password: "website-test-password",
  });
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("serves a public, accessible product homepage while preserving admin authentication", async () => {
  const response = await fetch(base);
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(response.headers.get("content-security-policy")).toContain(
    "default-src 'self'",
  );
  const html = await response.text();
  expect(html).toContain('lang="zh-CN"');
  expect(html).toContain('id="download"');
  expect(html).toContain("隐私");
  expect((await fetch(`${base}/admin/`)).status).toBe(200);
  expect((await fetch(`${base}/api/admin/system`)).status).toBe(401);
});

it("serves legal pages and only whitelisted, correctly typed website assets", async () => {
  for (const route of ["/privacy", "/terms"]) {
    const response = await fetch(`${base}${route}`);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Selah");
  }
  for (const [file, type] of [
    ["site.css", "text/css"],
    ["site.js", "javascript"],
    ["install-qr.svg", "image/svg+xml"],
    ["icon.svg", "image/svg+xml"],
    ["reader.webp", "image/webp"],
  ]) {
    const response = await fetch(`${base}/website/${file}`);
    expect(response.status, file).toBe(200);
    expect(response.headers.get("content-type")).toContain(type);
  }
  for (const file of [
    "app.js",
    "missing.png",
    "catalog.json",
    ".env",
    "%2e%2e%2findex.html",
  ]) {
    expect((await fetch(`${base}/website/${file}`)).status, file).toBe(404);
  }
  const head = await fetch(`${base}/website/install-qr.svg`, {
    method: "HEAD",
  });
  expect(head.status).toBe(200);
  expect(await head.text()).toBe("");
});
