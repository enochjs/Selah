import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, expect, it } from "vitest";
import { createApplication } from "../src/app";

let app: Awaited<ReturnType<typeof createApplication>>;
let root: string;
let origin: string;
const video = "sample-video";
const sha256 = createHash("sha256").update(video).digest("hex");
const videoPath = `/api/english-lessons/video/${sha256}.mp4`;
const lesson = {
  id: "2026-11-22-lost-keys",
  date: "2026-11-22",
  title: "I Lost My Key",
  stage: 1,
  duration: 245,
  sha256,
  chapters: [0, 49, 130, 167].map((start, index) => ({
    start,
    prompt: `Practice ${index + 1}`,
  })),
  phrases: [{ text: "I lost my key!", purpose: "说出问题。" }],
  practice: "Think of something you lost.",
  source: {
    credit: "VOA Learning English",
    url: "https://learningenglish.voanews.com/example",
    excerpt: "00:15.30–00:45.30",
  },
};

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-english-"));
  const mediaRoot = path.join(root, "media");
  const courseRoot = path.join(mediaRoot, "english-lessons");
  await mkdir(courseRoot, { recursive: true });
  await writeFile(path.join(courseRoot, `${sha256}.mp4`), video);
  await writeFile(
    path.join(courseRoot, `${"b".repeat(64)}.mp4`),
    "unpublished",
  );
  await writeFile(
    path.join(courseRoot, "catalog.json"),
    JSON.stringify({
      version: 1,
      lessons: [
        lesson,
        {
          ...lesson,
          id: "2026-11-21-missing",
          date: "2026-11-21",
          sha256: "c".repeat(64),
        },
      ],
    }),
  );
  app = await createApplication({
    mediaRoot,
    stateRoot: path.join(root, "state"),
    password: "english-test-password",
  });
  await app.listen(0, "127.0.0.1");
  origin = await app.getUrl();
});

afterAll(async () => {
  if (app) await app.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("lists lessons with locally available, published media", async () => {
  const response = await fetch(`${origin}/api/english-lessons`);
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ version: 1, lessons: [lesson] });
});

it("serves video with HEAD, ETag and byte ranges for chapter seeking", async () => {
  const url = origin + videoPath;
  const head = await fetch(url, { method: "HEAD" });
  expect(head.status).toBe(200);
  expect(head.headers.get("content-type")).toBe("video/mp4");
  expect(head.headers.get("content-length")).toBe(String(video.length));
  const etag = head.headers.get("etag")!;
  const partial = await fetch(url, {
    headers: { Range: "bytes=2-5", "If-Range": etag },
  });
  expect(partial.status).toBe(206);
  expect(partial.headers.get("content-range")).toBe(
    `bytes 2-5/${video.length}`,
  );
  expect(await partial.text()).toBe(video.slice(2, 6));
  expect(
    (await fetch(url, { headers: { "If-None-Match": etag } })).status,
  ).toBe(304);
});

it("serves only videos referenced by the published catalog", async () => {
  for (const name of [`${"b".repeat(64)}.mp4`, "catalog.json"]) {
    const response = await fetch(`${origin}/api/english-lessons/video/${name}`);
    expect(response.status).toBe(404);
  }
});
