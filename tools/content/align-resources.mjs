import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import {
  loadResourceEnvironment,
  projectRoot,
  sourceProject,
} from "./environment.mjs";
loadResourceEnvironment();
const python = path.join(
  projectRoot,
  process.platform === "win32"
    ? "tools/content/.venv-align/Scripts/python.exe"
    : "tools/content/.venv-align/bin/python",
);
if (!existsSync(python)) {
  console.error(
    "Install the alignment environment first: uv venv --python 3.11 tools/content/.venv-align && uv pip install --python tools/content/.venv-align/bin/python -r tools/content/requirements-alignment.txt",
  );
  process.exit(1);
}
const forwarded = process.argv.slice(2);
const locales = forwarded.includes("--locale") ? [null] : ["en", "zh"];
for (const locale of locales) {
  const args = [
    "tools/content/align_audio.py",
    "--source",
    sourceProject(),
    "--publish",
    ...forwarded,
  ];
  if (locale) args.push("--locale", locale);
  const child = spawn(python, ["-u", ...args], {
    cwd: projectRoot,
    stdio: "inherit",
    env: process.env,
  });
  const stop = () => child.kill("SIGTERM");
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  const code = await new Promise((resolve) => {
    child.on("error", (error) => {
      console.error(error.message);
      resolve(1);
    });
    child.on("exit", (value) => resolve(value ?? 1));
  });
  process.removeListener("SIGINT", stop);
  process.removeListener("SIGTERM", stop);
  if (code) {
    process.exitCode = code;
    break;
  }
}
