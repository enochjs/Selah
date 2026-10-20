import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  loadResourceEnvironment,
  sourceProject,
  projectRoot,
} from "./environment.mjs";
loadResourceEnvironment();
const result = spawnSync(
  "python3",
  [
    path.join(projectRoot, "tools/content/import_resources.py"),
    process.argv[2] || sourceProject(),
  ],
  { stdio: "inherit" },
);
if (result.error) console.error(result.error.message);
process.exitCode = result.status ?? 1;
