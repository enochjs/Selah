// Stage the existing bundled recordings for the independent resource server.
import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const mediaRoot = path.resolve(
  root,
  process.env.MEDIA_ROOT || "storage/resources/media",
);
const catalog = JSON.parse(
  await readFile(path.join(root, "packages/content/data/hymns.json"), "utf8"),
);
await mkdir(mediaRoot, { recursive: true });
for (const item of catalog.items) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.id))
    throw Error("Invalid hymn ID");
  const source = path.join(root, "apps/app/assets/audio", `${item.id}.mp3`);
  const digest = createHash("sha256")
    .update(await readFile(source))
    .digest("hex");
  if (item.audioPath !== `/api/audio/resources/${digest}.mp3`)
    throw Error(`Hymn media checksum mismatch: ${item.id}`);
  const target = path.join(mediaRoot, `${digest}.mp3`);
  try {
    await copyFile(source, target, constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    if (
      createHash("sha256")
        .update(await readFile(target))
        .digest("hex") !== digest
    )
      throw Error(`Existing hymn media checksum mismatch: ${item.id}`);
  }
  console.log(`Ready: ${item.id}`);
}
