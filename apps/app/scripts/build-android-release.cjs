const { spawnSync } = require("node:child_process");
const path = require("node:path");
const { loadProjectEnv } = require("@expo/env");
const withLocalAudioService = require("../plugins/with-local-audio-service");

const projectRoot = path.resolve(__dirname, "..");
loadProjectEnv(projectRoot, { mode: "production", force: true });
withLocalAudioService({ name: "Selah", slug: "selah-bible" });

const environment = { ...process.env, NODE_ENV: "production" };
const expo = require.resolve("expo/bin/cli");
console.log(`Release resource server: ${environment.EXPO_PUBLIC_BIBLE_SERVER_URL}`);

const prebuild = spawnSync(
  process.execPath,
  [expo, "prebuild", "--platform", "android", "--no-install", "--no-clean"],
  { cwd: projectRoot, env: environment, stdio: "inherit" },
);
if (prebuild.error) throw prebuild.error;
if (prebuild.status !== 0) process.exit(prebuild.status ?? 1);

const build = spawnSync(
  "./gradlew",
  [
    ":app:clean",
    ":app:assembleRelease",
    "-PreactNativeArchitectures=arm64-v8a",
    ...process.argv.slice(2),
  ],
  {
    cwd: path.join(projectRoot, "android"),
    env: environment,
    stdio: "inherit",
  },
);
if (build.error) throw build.error;
process.exit(build.status ?? 1);
