import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let server: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let base: string;
const chapterAudio = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x00]),
  Buffer.alloc(413),
]);
const verseAudio = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x00]),
  Buffer.alloc(413, 1),
]);
const digest = (data: Buffer) =>
  createHash("sha256").update(data).digest("hex");
const chapterHash = digest(chapterAudio);
const verseHash = digest(verseAudio);
const chapterPath = `/api/audio/resources/${chapterHash}.mp3`;
const versePath = `/api/audio/aligned/${verseHash}.mp3`;
const catalogFile = () => path.join(root, "content/chapter-audio.json");
const defaultCatalog = {
  "genesis:1:en": {
    duration: 10,
    path: chapterPath,
    segments: [
      [1, 0, 2],
      [2, 2, 4],
    ],
    verseFiles: [
      { verse: 1, path: versePath, duration: 2, coveredVerses: [1] },
      { verse: 2, path: versePath, duration: 2, coveredVerses: [2] },
    ],
    reader: "NIV reader",
    sourceUrl: "https://example.com/chapter.mp3",
    timingQuality: "verified",
    alignmentStatus: "approved",
  },
  "genesis:2:en": { duration: 10, path: chapterPath },
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-download-manifest-"));
  for (const folder of [
    "content",
    "media",
    "alignment/media",
    "legacy/assets/mp3/niv/Genesis",
  ])
    await mkdir(path.join(root, folder), { recursive: true });
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  await writeFile(path.join(root, "media", `${chapterHash}.mp3`), chapterAudio);
  await writeFile(
    path.join(root, "alignment/media", `${verseHash}.mp3`),
    verseAudio,
  );
  await writeFile(
    path.join(root, "legacy/assets/mp3/niv/Genesis/1.mp3"),
    chapterAudio,
  );
  server = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    alignmentRoot: path.join(root, "alignment"),
    legacyRoot: path.join(root, "legacy"),
    stateRoot: path.join(root, "state"),
    password: "download-manifest-test-password",
  });
  await new Promise<void>((resolve) =>
    server.getHttpServer().listen(0, "127.0.0.1", resolve),
  );
  const address = server.getHttpServer().address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  base = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  await writeFile(catalogFile(), JSON.stringify(defaultCatalog));
});

afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("publishes unique chapter and verse downloads with the same sizes as media GET and HEAD", async () => {
  const response = await fetch(`${base}/api/audio/download-manifest`);
  expect(response.status).toBe(200);
  const manifest = await response.json();
  expect(manifest).toEqual({
    version: 1,
    files: [
      { path: chapterPath, size: chapterAudio.length, sha256: chapterHash },
      { path: versePath, size: verseAudio.length, sha256: verseHash },
    ],
    recordings: defaultCatalog,
  });
  for (const file of manifest.files) {
    const get = await fetch(`${base}${file.path}`);
    const head = await fetch(`${base}${file.path}`, { method: "HEAD" });
    expect(get.status).toBe(200);
    expect(head.status).toBe(200);
    expect(Number(head.headers.get("content-length"))).toBe(file.size);
    expect((await get.arrayBuffer()).byteLength).toBe(file.size);
  }
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
});

it("reads the current catalog snapshot on every request", async () => {
  await fetch(`${base}/api/audio/download-manifest`);
  await writeFile(
    catalogFile(),
    JSON.stringify({
      "genesis:1:en": { duration: 1, path: versePath },
    }),
  );
  expect(
    await (await fetch(`${base}/api/audio/download-manifest`)).json(),
  ).toEqual({
    version: 1,
    files: [{ path: versePath, size: verseAudio.length, sha256: verseHash }],
    recordings: { "genesis:1:en": { duration: 1, path: versePath } },
  });
});

it("skips missing, empty, invalid and legacy files without exposing local paths", async () => {
  const emptyHash = "b".repeat(64);
  const directoryHash = "c".repeat(64);
  const invalidHash = "d".repeat(64);
  const missingHash = "0".repeat(64);
  const truncatedHash = "e".repeat(64);
  await writeFile(path.join(root, "media", `${emptyHash}.mp3`), "");
  await mkdir(path.join(root, "media", `${directoryHash}.mp3`), {
    recursive: true,
  });
  await writeFile(path.join(root, "media", `${invalidHash}.mp3`), "not an MP3");
  await writeFile(
    path.join(root, "media", `${truncatedHash}.mp3`),
    chapterAudio.subarray(0, 4),
  );
  const paths = [
    chapterPath,
    `/api/audio/resources/${missingHash}.mp3`,
    `/api/audio/resources/${emptyHash}.mp3`,
    `/api/audio/resources/${directoryHash}.mp3`,
    `/api/audio/resources/${invalidHash}.mp3`,
    `/api/audio/resources/${truncatedHash}.mp3`,
    "/api/audio/bible/niv/Genesis/1.mp3",
    "/api/audio/resources/../../secret.mp3",
    "/api/audio/resources/package.json",
    `${chapterPath}?token=secret`,
    `${chapterPath}\n`,
    `https://example.com${chapterPath}`,
    path.join(root, "media", `${chapterHash}.mp3`),
  ];
  await writeFile(
    catalogFile(),
    JSON.stringify(
      Object.fromEntries(
        paths.map((value, index) => [
          `genesis:${index + 1}:en`,
          { duration: 1, path: value },
        ]),
      ),
    ),
  );
  const response = await fetch(`${base}/api/audio/download-manifest`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    version: 1,
    files: [
      { path: chapterPath, size: chapterAudio.length, sha256: chapterHash },
    ],
    recordings: { "genesis:1:en": { duration: 1, path: chapterPath } },
  });
});

it("accepts MP3 frames after a large ID3 tag including a v2.4 footer", async () => {
  const tagSize = 32768;
  const tagged = Buffer.concat([
    Buffer.from([0x49, 0x44, 0x33, 4, 0, 0x10, 0, 2, 0, 0]),
    Buffer.alloc(tagSize),
    Buffer.alloc(10),
    verseAudio,
  ]);
  const sha256 = digest(tagged);
  const resourcePath = `/api/audio/resources/${sha256}.mp3`;
  await writeFile(path.join(root, "media", `${sha256}.mp3`), tagged);
  await writeFile(
    catalogFile(),
    JSON.stringify({ "genesis:1:en": { path: resourcePath, duration: 1 } }),
  );
  expect(
    await (await fetch(`${base}/api/audio/download-manifest`)).json(),
  ).toEqual({
    version: 1,
    files: [{ path: resourcePath, size: tagged.length, sha256 }],
    recordings: { "genesis:1:en": { path: resourcePath, duration: 1 } },
  });
});

it("refreshes cached media checks when a file changes or disappears", async () => {
  const audioFile = path.join(root, "media", `${chapterHash}.mp3`);
  try {
    await writeFile(
      catalogFile(),
      JSON.stringify({ "genesis:1:en": { path: chapterPath, duration: 1 } }),
    );
    await fetch(`${base}/api/audio/download-manifest`);
    const larger = Buffer.concat([chapterAudio, verseAudio]);
    await writeFile(audioFile, larger);
    let response = await fetch(`${base}/api/audio/download-manifest`);
    expect(await response.json()).toEqual({
      version: 1,
      files: [{ path: chapterPath, size: larger.length, sha256: chapterHash }],
      recordings: { "genesis:1:en": { path: chapterPath, duration: 1 } },
    });
    expect(
      (await fetch(`${base}${chapterPath}`, { method: "HEAD" })).headers.get(
        "content-length",
      ),
    ).toBe(String(larger.length));
    await writeFile(audioFile, Buffer.alloc(larger.length));
    await utimes(audioFile, new Date("2026-01-01"), new Date("2026-01-01"));
    response = await fetch(`${base}/api/audio/download-manifest`);
    expect(await response.json()).toEqual({
      version: 1,
      files: [],
      recordings: {},
    });
    await rm(audioFile);
    response = await fetch(`${base}/api/audio/download-manifest`);
    expect(await response.json()).toEqual({
      version: 1,
      files: [],
      recordings: {},
    });
  } finally {
    await writeFile(audioFile, chapterAudio);
  }
});

it("preserves complete published recordings and excludes chapters with missing dependencies", async () => {
  const missingPath = `/api/audio/resources/${"0".repeat(64)}.mp3`;
  const complete = defaultCatalog["genesis:1:en"];
  await writeFile(
    catalogFile(),
    JSON.stringify({
      "genesis:1:en": complete,
      "genesis:2:en": { ...complete, path: missingPath },
      "genesis:3:en": {
        ...complete,
        verseFiles: [
          ...complete.verseFiles,
          { verse: 3, path: missingPath, duration: 1 },
        ],
      },
      "genesis:4:en": { duration: 1, verseFiles: complete.verseFiles },
      "genesis:5:en": { ...complete, verseFiles: [null] },
      "genesis:6:en": { ...complete, verseFiles: [{ verse: 1, duration: 1 }] },
      "genesis:7:en": null,
    }),
  );
  const response = await fetch(`${base}/api/audio/download-manifest`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({
    version: 1,
    files: [
      { path: chapterPath, size: chapterAudio.length, sha256: chapterHash },
      { path: versePath, size: verseAudio.length, sha256: verseHash },
    ],
    recordings: { "genesis:1:en": complete },
  });
});
