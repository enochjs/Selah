import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const serverRoot = fileURLToPath(new URL("../", import.meta.url));
// Nest's DTO validation needs the decorator metadata emitted by TypeScript.
// Node watches source files and reruns this build before restarting the server.
const build = spawnSync(
  process.execPath,
  [require.resolve("typescript/lib/tsc.js"), "-p", "tsconfig.build.json"],
  { cwd: serverRoot, stdio: "inherit" },
);
if (build.error) throw build.error;
if (build.status !== 0) process.exit(build.status ?? 1);
await require("../dist/main.js").main();
