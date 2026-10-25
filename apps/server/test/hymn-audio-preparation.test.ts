import { expect, it } from "vitest";
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  copyFile,
  rm,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

it("can still prepare bundled audio after uploaded hymns enter the canonical catalog", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selah-hymn-preparation-"));
  const repository = path.resolve(__dirname, "../../..");
  try {
    for (const folder of [
      "tools/assets",
      "apps/app/assets/audio",
      "packages/content/data",
    ])
      await mkdir(path.join(root, folder), { recursive: true });
    const script = "tools/assets/prepare-hymn-audio.mjs";
    await copyFile(path.join(repository, script), path.join(root, script));
    const catalog = JSON.parse(
      await readFile(
        path.join(repository, "packages/content/data/hymns.json"),
        "utf8",
      ),
    );
    const bundled = catalog.items.filter(
      (row: { uploadedAt?: string }) => !row.uploadedAt,
    );
    for (const item of bundled)
      await copyFile(
        path.join(repository, "apps/app/assets/audio", `${item.id}.mp3`),
        path.join(root, "apps/app/assets/audio", `${item.id}.mp3`),
      );
    catalog.items = [
      ...bundled,
      {
        ...bundled[0],
        id: "hymn-uploaded",
        uploadedAt: new Date().toISOString(),
        reviewStatus: "pending",
        enabled: false,
      },
    ];
    const json = JSON.stringify(catalog);
    const catalogFile = path.join(root, "packages/content/data/hymns.json");
    await writeFile(catalogFile, json);
    const { stdout } = await promisify(execFile)(
      process.execPath,
      [path.join(root, script)],
      { env: { ...process.env, MEDIA_ROOT: path.join(root, "media") } },
    );
    expect(stdout.match(/Ready:/g)).toHaveLength(bundled.length);
    expect(await readFile(catalogFile, "utf8")).toBe(json);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
