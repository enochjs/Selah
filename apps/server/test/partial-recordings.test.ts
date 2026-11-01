import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";

let server: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let base: string;
let cookie: string;
const audio = Buffer.concat([
  Buffer.from([0xff, 0xfb, 0x90, 0x00]),
  Buffer.alloc(413),
]);
const hash = createHash("sha256").update(audio).digest("hex");
const audioPath = `/api/audio/resources/${hash}.mp3`;
const missingVerses = [{ verse: 2, reason: "not-narrated-in-source" }];
const missingFragments = [
  { verse: 1, text: "Verse", reason: "not-narrated-in-source" },
];
const partial = {
  duration: 10,
  path: audioPath,
  segments: [],
  timingQuality: "verse-file",
  alignmentStatus: "partial",
  missingVerses,
  missingFragments,
  verseFiles: [
    { verse: 1, coveredVerses: [1, 3], path: audioPath, duration: 2 },
  ],
};
const catalog = {
  "genesis:1:en": partial,
  "genesis:1:zh": {
    ...partial,
    alignmentStatus: "aligned",
    missingVerses: undefined,
    missingFragments: undefined,
    verseFiles: [
      ...partial.verseFiles,
      { verse: 2, coveredVerses: [2], path: audioPath, duration: 2 },
    ],
  },
  "genesis:2:en": { duration: 10, path: audioPath, alignmentStatus: "pending" },
  "genesis:2:zh": {
    duration: 10,
    path: audioPath,
    alignmentStatus: "review-required",
  },
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-partial-server-"));
  await mkdir(path.join(root, "content"));
  await mkdir(path.join(root, "media"));
  for (const [name, value] of Object.entries({
    "bible.json": [
      {
        id: "genesis",
        en: "Genesis",
        zh: "创世记",
        testament: "old",
        chapters: Array.from({ length: 2 }, () =>
          [1, 2, 3].map((number) => ({
            number,
            en: `Verse ${number}`,
            zh: `节${number}`,
          })),
        ),
      },
    ],
    "chapter-audio.json": catalog,
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  await writeFile(path.join(root, "media", `${hash}.mp3`), audio);
  server = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    stateRoot: path.join(root, "state"),
    password: "partial-recordings-test-password",
  });
  await new Promise<void>((resolve) =>
    server.getHttpServer().listen(0, "127.0.0.1", resolve),
  );
  const address = server.getHttpServer().address();
  if (!address || typeof address === "string")
    throw new Error("Missing address");
  base = `http://127.0.0.1:${address.port}`;
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: "admin",
      password: "partial-recordings-test-password",
    }),
  });
  expect(login.status).toBe(200);
  cookie = login.headers.get("set-cookie")!.split(";")[0];
});
afterAll(async () => {
  if (server) await server.close();
  if (root) await rm(root, { recursive: true, force: true });
});
const admin = async (route: string) =>
  (
    await fetch(`${base}/api/admin${route}`, { headers: { Cookie: cookie } })
  ).json();

it("reports partial, complete, pending and review counts separately even with a legacy manifest", async () => {
  const data = await admin("/overview");
  expect(data.counts).toMatchObject({
    recordings: 4,
    aligned: 1,
    partial: 1,
    pending: 1,
    review: 1,
    verseFileRecordings: 2,
    missingVerseCount: 1,
    missingFragmentCount: 1,
    chapterOnly: 2,
  });
});
it("exposes confirmed missing narration in recording lists and previews without fake playable items", async () => {
  const list = await admin("/recordings?locale=en&chapter=1");
  expect(list.items[0]).toMatchObject({
    alignmentStatus: "partial",
    missingVerses,
    missingFragments,
    items: 1,
  });
  const recording = await admin("/recordings/genesis%3A1%3Aen");
  expect(recording.missingVerses).toEqual(missingVerses);
  expect(recording.missingFragments).toEqual(missingFragments);
  expect(recording.items).toEqual([
    {
      verse: 1,
      coveredVerses: [1, 3],
      path: audioPath,
      start: 0,
      end: 2,
      duration: 2,
      text: "Verse 1",
    },
  ]);
});
it("keeps partial metadata and all available audio files in offline downloads", async () => {
  const response = await fetch(`${base}/api/audio/download-manifest`);
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.recordings["genesis:1:en"]).toEqual(partial);
  expect(result.files).toEqual([
    { path: audioPath, size: audio.length, sha256: hash },
  ]);
});
it("excludes partial recordings when any published available verse file is unavailable", async () => {
  await writeFile(
    path.join(root, "content/chapter-audio.json"),
    JSON.stringify({
      "genesis:1:en": {
        ...partial,
        verseFiles: [
          {
            ...partial.verseFiles[0],
            path: `/api/audio/resources/${"0".repeat(64)}.mp3`,
          },
        ],
      },
    }),
  );
  const result = await (
    await fetch(`${base}/api/audio/download-manifest`)
  ).json();
  expect(result.recordings).toEqual({});
});
