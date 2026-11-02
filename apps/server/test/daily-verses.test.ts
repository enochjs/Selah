import { afterAll, beforeAll, expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  rename,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import sharp from "sharp";
import { createApplication } from "../src/app";
let app: Awaited<ReturnType<typeof createApplication>>,
  root: string,
  base: string,
  cookie: string,
  csrf: string;
const options = () => ({
  contentRoot: path.join(root, "content"),
  stateRoot: path.join(root, "state"),
  mediaRoot: path.join(root, "media"),
  password: "daily-password",
});
async function api(route: string, method = "GET", body?: unknown, auth = true) {
  return fetch(`${base}/api/admin/daily-verses${route}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(auth ? { Cookie: cookie, "X-CSRF-Token": csrf } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function upload(
  bytes: Uint8Array,
  revision: number,
  extra: Record<string, string> = {},
) {
  const form = new FormData();
  form.set(
    "image",
    new Blob([Uint8Array.from(bytes)], { type: "image/jpeg" }),
    "image.jpg",
  );
  for (const [key, value] of Object.entries({
    revision: String(revision),
    author: "Photographer",
    sourceUrl: "https://example.com/photo",
    license: "CC0",
    licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
    theme: "Peace",
    ...extra,
  }))
    form.set(key, value);
  return fetch(`${base}/api/admin/daily-verses/images`, {
    method: "POST",
    headers: { Cookie: cookie, "X-CSRF-Token": csrf },
    body: form,
  });
}
beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "selah-daily-"));
  await mkdir(path.join(root, "content"));
  for (const [file, value] of Object.entries({
    "bible.json": [
      {
        id: "psalms",
        zh: "诗篇",
        en: "Psalms",
        testament: "old",
        chapters: [
          [
            { number: 1, zh: "有福", en: "Blessed" },
            { number: 2, zh: "喜爱", en: "Delight" },
            {
              number: 3,
              zh: "",
              en: "On my bed I remember you",
              zhMergedInto: 2,
            },
            { number: 4, zh: "文字", en: "Text", enOmitted: true },
            { number: 5, zh: "  ", en: "Text" },
            { number: 6, zh: "文字", en: "Text", enMergedInto: 2 },
            { number: 7, zh: "文字", en: "Text", zhOmitted: true },
            { number: 8, zh: "文字", en: " " },
          ],
        ],
      },
    ],
    "dictionary.json": {},
    "resource-manifest.json": {},
    "chapter-audio.json": {},
  }))
    await writeFile(path.join(root, "content", file), JSON.stringify(value));
  app = await createApplication(options());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const login = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "daily-password" }),
  });
  cookie = login.headers.get("set-cookie")!.split(";")[0];
  csrf = (await login.json()).csrf;
});
afterAll(async () => {
  await app?.close();
  if (root) await rm(root, { recursive: true, force: true });
});
it("provides empty catalogs for older roots and protects admin writes", async () => {
  expect(
    (await (await fetch(`${base}/api/daily-verses`)).json()).items,
  ).toEqual([]);
  expect((await api("", "GET", undefined, false)).status).toBe(401);
  expect(
    (
      await fetch(`${base}/api/admin/daily-verses`, {
        method: "PUT",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: "{}",
      })
    ).status,
  ).toBe(403);
  expect((await api("?date=2026-02-30")).status).toBe(400);
});
it("validates JPEG bytes and maintains immutable image attribution", async () => {
  expect((await upload(Buffer.from("not jpeg"), 0)).status).toBe(400);
  const bytes = await sharp({
    create: { width: 80, height: 60, channels: 3, background: "#88aa77" },
  })
    .jpeg()
    .toBuffer();
  expect((await upload(bytes, 0, { unknown: "bad" })).status).toBe(400);
  const response = await upload(bytes, 0);
  expect(response.status).toBe(201);
  const image = (await response.json()).image;
  expect(image).toMatchObject({
    width: 80,
    height: 60,
    author: "Photographer",
  });
  expect((await upload(bytes, 1, { author: "Overwrite" })).status).toBe(409);
  expect(
    (await fetch(`${base}/api/daily-verses/images/${image.file}`)).status,
  ).toBe(404);
  expect(
    (await api(`/images/${image.file}`)).headers.get("content-type"),
  ).toContain("image/jpeg");
});
it("rejects missing/null fields, invalid nested refs and malformed queries", async () => {
  const catalog = await (await api("")).json();
  const draft = {
    revision: catalog.revision,
    id: "daily-validation",
    date: "2027-01-03",
    reference: { bookId: "psalms", chapter: 1, verse: 1 },
    imageId: catalog.images[0].id,
    theme: "Peace",
  };
  for (const change of [
    { reference: undefined },
    { reference: null },
    { date: null },
    { imageId: null },
    { date: "" },
    { imageId: "missing" },
    { reference: { ...draft.reference, endVerse: 0 } },
    { reference: { ...draft.reference, unexpected: true } },
  ]) {
    expect((await api("", "PUT", { ...draft, ...change })).status).toBe(400);
  }
  for (const route of [
    "?from=not-date",
    "?from=2026-12-31&to=2026-01-01",
    "?date=2026-11-02&date=2026-11-03",
    "?unknown=true",
  ])
    expect((await api(route)).status).toBe(400);
  const file = path.join(
    root,
    "state",
    "daily-verse-images",
    catalog.images[0].file,
  );
  const bytes = await readFile(file);
  await writeFile(file, "tampered");
  expect((await api(`/images/${catalog.images[0].file}`)).status).toBe(404);
  await writeFile(file, bytes);
  await rename(file, `${file}.held`);
  expect((await api(`/images/${catalog.images[0].file}`)).status).toBe(404);
  await rename(`${file}.held`, file);
});
it("rejects ineligible bilingual range members on draft save and legacy approval without changing publication", async () => {
  const { revision, images, items } = await (await api("")).json();
  const catalog = { revision, images, items };
  const published = await (await fetch(`${base}/api/daily-verses`)).json();
  const file = path.join(root, "content", "daily-verses.json");
  for (const [index, reference] of [
    ...[3, 4, 5, 6, 7, 8].map((verse) => ({
      bookId: "psalms",
      chapter: 1,
      verse,
    })),
    { bookId: "psalms", chapter: 1, verse: 2, endVerse: 3 },
  ].entries()) {
    const draft = {
      id: `invalid-${index}`,
      date: "2028-01-01",
      reference,
      imageId: catalog.images[0].id,
      theme: "Peace",
      status: "draft",
    };
    const { status: _status, ...body } = draft;
    void _status;
    expect(
      (await api("", "PUT", { ...body, revision: catalog.revision })).status,
    ).toBe(400);
    await writeFile(
      file,
      JSON.stringify({ ...catalog, items: [...catalog.items, draft] }),
    );
    expect((await api(`/${draft.id}/preview`)).status).toBe(400);
    expect(
      (
        await api("/review", "PUT", {
          id: draft.id,
          status: "approved",
          revision: catalog.revision,
        })
      ).status,
    ).toBe(400);
    expect(await (await fetch(`${base}/api/daily-verses`)).json()).toEqual(
      published,
    );
    await writeFile(file, JSON.stringify(catalog));
  }
});

it("creates draft, previews real scripture, approves publicly, enforces concurrency, withdraws and survives restart", async () => {
  const catalog = await (await api("")).json();
  const image = catalog.images[0];
  const draft = {
    revision: 1,
    id: "daily-2026-11-02",
    date: "2026-11-02",
    reference: { bookId: "psalms", chapter: 1, verse: 1 },
    imageId: image.id,
    theme: "Peace",
  };
  expect((await api("", "PUT", { ...draft, date: "2026-02-30" })).status).toBe(
    400,
  );
  expect(
    (
      await api("", "PUT", {
        ...draft,
        reference: { bookId: "psalms", chapter: 1, verse: 3 },
      })
    ).status,
  ).toBe(400);
  expect(
    (await api("", "PUT", { ...draft, file: "../../secret" })).status,
  ).toBe(400);
  expect((await api("", "PUT", draft)).status).toBe(200);
  expect((await api("", "PUT", draft)).status).toBe(409);
  const preview = await (await api(`/${draft.id}/preview`)).json();
  expect(preview.scripture.verses[0].en).toBe("Blessed");
  expect(
    (await (await fetch(`${base}/api/daily-verses`)).json()).items,
  ).toHaveLength(0);
  expect(
    (
      await api("/review", "PUT", {
        revision: 2,
        id: draft.id,
        status: "approved",
      })
    ).status,
  ).toBe(200);
  const published = await (await fetch(`${base}/api/daily-verses`)).json();
  expect(published.items).toHaveLength(1);
  expect(published.items[0].reviewedBy).toBeUndefined();
  expect(
    (await fetch(`${base}/api/daily-verses/images/${image.file}`)).status,
  ).toBe(200);
  expect(
    (
      await api("", "PUT", {
        ...draft,
        revision: 3,
        id: "duplicate",
        date: "2026-11-03",
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await api("/review", "PUT", {
        revision: 3,
        id: draft.id,
        status: "withdrawn",
      })
    ).status,
  ).toBe(200);
  expect(
    (await fetch(`${base}/api/daily-verses/images/${image.file}`)).status,
  ).toBe(404);
  expect((await api("/images/%2e%2e%2fsecret.jpg")).status).toBe(404);
  const backups = await readdir(path.join(root, "state", "backups"));
  expect(backups).toHaveLength(4);
  const state = JSON.parse(
    await readFile(path.join(root, "state", "state.json"), "utf8"),
  );
  expect(state.audit[0].action).toBe("daily-verse.review");
  await app.close();
  app = await createApplication(options());
  await app.listen(0, "127.0.0.1");
  base = await app.getUrl();
  const persisted = JSON.parse(
    await readFile(path.join(root, "content", "daily-verses.json"), "utf8"),
  );
  expect(persisted.revision).toBe(4);
  expect(persisted.items[0].status).toBe("withdrawn");
  expect(
    (await (await fetch(`${base}/api/daily-verses`)).json()).items,
  ).toEqual([]);
});
