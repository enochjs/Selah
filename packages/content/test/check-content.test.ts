import { afterAll, beforeAll, expect, it } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../scripts/check-content.mjs", import.meta.url),
);
let directory: string;
beforeAll(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "selah-content-check-"));
  for (const [name, value] of Object.entries({
    "bible.json": [],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
  })) {
    await writeFile(path.join(directory, name), JSON.stringify(value));
  }
});
afterAll(async () => {
  await rm(directory, { recursive: true, force: true });
});

it("checks the configured content instead of silently checking the bundled dataset", () => {
  const result = spawnSync(
    process.execPath,
    [script, "--content-root", directory],
    { encoding: "utf8" },
  );
  expect(result.status).toBe(1);
  expect(result.stderr).toContain("ERR_ASSERTION");
  expect(result.stdout).not.toContain("Verified 66 books");
});

it("requires the configured timing and audit evidence for local supplements", () => {
  for (const option of ["--timing-root", "--audit-root"]) {
    const result = spawnSync(process.execPath, [script, option, directory], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(directory);
  }
});
