import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

export function loadResourceEnvironment() {
  const environment = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(projectRoot, "apps/server", name);
    if (existsSync(file))
      Object.assign(environment, parseEnv(readFileSync(file, "utf8")));
  }
  for (const [key, value] of Object.entries(environment)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

export function sourceProject() {
  const root = process.env.BIBLE_RESOURCE_ROOT;
  if (
    !root ||
    !existsSync(path.join(root, "assets/mp3")) ||
    !existsSync(path.join(root, "assets/books"))
  ) {
    throw new Error(
      "Set BIBLE_RESOURCE_ROOT in apps/server/.env.local to the archived Bible resource project.",
    );
  }
  return root;
}
