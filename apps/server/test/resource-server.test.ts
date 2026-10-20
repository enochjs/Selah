import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let server: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let base: string;
const media = "a".repeat(64) + ".mp3";
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-resource-"));
  await mkdir(path.join(root, "source/assets/mp3/和合本/诗篇"), {
    recursive: true,
  });
  await mkdir(path.join(root, "alignment/media"), { recursive: true });
  await mkdir(path.join(root, "storage/resources/media"), { recursive: true });
  await writeFile(
    path.join(root, "storage/resources/media", media),
    "provider",
  );
  await writeFile(path.join(root, "alignment/media", media), "0123456789");
  await writeFile(
    path.join(root, "source/assets/mp3/和合本/诗篇/诗篇23.mp3"),
    "original",
  );
  await mkdir(path.join(root, "content"), { recursive: true });
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  server = await createApplication({
    legacyRoot: path.join(root, "source"),
    alignmentRoot: path.join(root, "alignment"),
    mediaRoot: path.join(root, "storage/resources/media"),
    contentRoot: path.join(root, "content"),
    stateRoot: path.join(root, "state"),
    password: "resource-test-password",
  });
  await new Promise<void>((resolve) =>
    server.getHttpServer().listen(0, "127.0.0.1", resolve),
  );
  const address = server.getHttpServer().address();
  if (!address || typeof address === "string")
    throw new Error("Missing test server address");
  base = `http://127.0.0.1:${address.port}`;
});
it("serves imported provider audio with byte ranges", async () => {
  const response = await fetch(`${base}/api/audio/resources/${media}`, {
    headers: { Range: "bytes=0-3" },
  });
  expect(response.status).toBe(206);
  expect(await response.text()).toBe("prov");
  expect((await fetch(`${base}/api/audio/resources/package.json`)).status).toBe(
    404,
  );
});
afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("serves MP3 byte ranges required by native and web seeking", async () => {
  const response = await fetch(`${base}/api/audio/aligned/${media}`, {
    headers: { Range: "bytes=3-6" },
  });
  expect(response.status).toBe(206);
  expect(response.headers.get("content-range")).toBe("bytes 3-6/10");
  expect(response.headers.get("accept-ranges")).toBe("bytes");
  expect(await response.text()).toBe("3456");
});
it("retains original chapter playback and URL-encoded Chinese paths", async () => {
  const response = await fetch(
    `${base}/api/audio/bible/cuv/${encodeURIComponent("诗篇")}/${encodeURIComponent("诗篇23.mp3")}`,
  );
  expect(await response.text()).toBe("original");
});
it("rejects invalid ranges and does not expose arbitrary files", async () => {
  expect(
    (
      await fetch(`${base}/api/audio/aligned/${media}`, {
        headers: { Range: "bytes=20-30" },
      })
    ).status,
  ).toBe(416);
  expect((await fetch(`${base}/api/audio/aligned/package.json`)).status).toBe(
    404,
  );
});

it("supports HEAD, cache validators, suffix ranges and If-Range", async () => {
  const url = `${base}/api/audio/aligned/${media}`;
  const head = await fetch(url, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-length")).toBe("10");
  expect(await head.text()).toBe("");
  const etag = head.headers.get("etag")!;
  expect(
    (await fetch(url, { headers: { "If-None-Match": etag } })).status,
  ).toBe(304);
  expect(
    await (await fetch(url, { headers: { Range: "bytes=-3" } })).text(),
  ).toBe("789");
  const stale = await fetch(url, {
    headers: { Range: "bytes=3-6", "If-Range": '"old"' },
  });
  expect(stale.status).toBe(200);
  expect(await stale.text()).toBe("0123456789");
});
it("retains app health contract and resource CORS", async () => {
  expect(await (await fetch(`${base}/api/health`)).json()).toMatchObject({
    service: "selah-resource",
    status: "ok",
    providers: true,
    alignment: true,
  });
  const response = await fetch(`${base}/api/audio/resources/${media}`, {
    method: "OPTIONS",
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});
