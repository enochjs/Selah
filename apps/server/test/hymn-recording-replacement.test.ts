import { afterEach, beforeEach, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createApplication } from "../src/app";
import { HymnsService } from "../src/hymns/hymns.service";
import { HymnsRepository } from "../src/hymns/hymns.repository";
import { StateRepository } from "../src/infrastructure/state.repository";

let root: string;
let app: Awaited<ReturnType<typeof createApplication>>;
let service: HymnsService;
let repository: HymnsRepository;
let id: string;
const details = {
  titleZh: "It Is Well",
  titleEn: "It Is Well",
  subtitleZh: "英文现场版",
  subtitleEn: "English live version",
  artist: "Kristene DiMarco",
  category: "敬拜",
  source: "User-provided recording",
  license: "授权待确认",
  lyrics: "[00:00.010]Original recording",
};

function mp3(frames: number) {
  const bytes = Buffer.alloc(417 * frames);
  for (let index = 0; index < frames; index++)
    bytes.set([0xff, 0xfb, 0x90, 0x00], 417 * index);
  return { bytes, name: "recording.mp3" };
}

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-hymn-replacement-"));
  await mkdir(path.join(root, "content"));
  await mkdir(path.join(root, "media"));
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(root, "content", name), JSON.stringify(value));
  app = await createApplication({
    contentRoot: path.join(root, "content"),
    mediaRoot: path.join(root, "media"),
    stateRoot: path.join(root, "state"),
    password: "replacement-test-password",
  });
  service = app.get(HymnsService);
  repository = app.get(HymnsRepository);
  const uploaded = await service.upload(
    { ...details, revision: 0 },
    mp3(5),
    "test-admin",
  );
  id = uploaded.item.id;
  await service.review(
    {
      id,
      revision: uploaded.revision,
      status: "approved",
      note: "Original review",
    },
    "test-admin",
  );
});

afterEach(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});

it("replaces a recording under the existing hymn ID and publishes it through review", async () => {
  const before = await repository.read();
  const original = before.items[0];
  const replacement = await service.replaceRecording(
    {
      ...details,
      id,
      revision: before.revision,
      lyrics: "[00:00.020]New recording",
    },
    mp3(10),
    "ssh:test-admin",
  );
  const pending = await repository.read();
  expect(pending.items).toHaveLength(1);
  expect(pending.items[0]).toMatchObject({
    id,
    titleZh: "It Is Well",
    lyrics: "[00:00.020]New recording",
    enabled: false,
    reviewStatus: "pending",
  });
  expect(pending.items[0].audioPath).not.toBe(original.audioPath);
  expect(pending.items[0].duration).toBeGreaterThan(original.duration);
  expect(pending.items[0].reviewedAt).toBeUndefined();
  expect((await service.published()).items).toHaveLength(0);
  expect(
    JSON.parse(
      await readFile(
        path.join(root, "state/backups", replacement.backup),
        "utf8",
      ),
    ),
  ).toEqual(before);
  expect(
    await readFile(
      path.join(
        root,
        "state/hymn-published",
        path.basename(original.audioPath),
      ),
    ),
  ).toEqual(mp3(5).bytes);
  await service.review(
    { id, revision: replacement.revision, status: "approved" },
    "ssh:test-admin",
  );
  const published = (await service.published()).items;
  expect(published).toHaveLength(1);
  expect(published[0]).toMatchObject({
    id,
    enabled: true,
    reviewStatus: "approved",
  });
  expect(
    await readFile(
      path.join(
        root,
        "state/hymn-published",
        path.basename(published[0].audioPath),
      ),
    ),
  ).toEqual(mp3(10).bytes);
  expect(app.get(StateRepository).get().audit).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        action: "hymn.replace-recording",
        actor: "ssh:test-admin",
        target: id,
      }),
    ]),
  );
});

it("rejects stale, missing and invalid replacements before changing the catalog", async () => {
  const before = await repository.read();
  const body = { ...details, id, revision: before.revision };
  for (const [input, file, status] of [
    [{ ...body, revision: 0 }, mp3(10), 409],
    [{ ...body, id: "missing" }, mp3(10), 404],
    [body, { bytes: Buffer.from("not MP3"), name: "recording.mp3" }, 400],
    [body, undefined, 400],
  ] as const) {
    await expect(
      service.replaceRecording(input, file, "test-admin"),
    ).rejects.toMatchObject({ status });
    expect(await repository.read()).toEqual(before);
  }
});
