const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { spawnSync } = require("node:child_process");

const root = resolve(__dirname, "../../..");
const pager = resolve(root, "node_modules/react-native-pager-view/package.json");

// Server-only installs do not include the client's native dependencies.
if (existsSync(pager)) {
  const result = spawnSync(
    process.execPath,
    [
      require.resolve("patch-package/index.js"),
      "--patch-dir",
      "apps/app/patches",
      "--error-on-fail",
    ],
    { cwd: root, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
