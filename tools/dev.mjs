import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import path from "node:path";
import { parseEnv } from "node:util";

const appRoot = fileURLToPath(new URL("../apps/app/", import.meta.url));
const environment = {};
for (const name of [".env", ".env.local"]) {
  const file = new URL(`../apps/app/${name}`, import.meta.url);
  if (existsSync(file))
    Object.assign(environment, parseEnv(readFileSync(file, "utf8")));
}
const origin =
  process.env.EXPO_PUBLIC_BIBLE_SERVER_URL ||
  environment.EXPO_PUBLIC_BIBLE_SERVER_URL;
if (!origin)
  throw new Error(
    "Set EXPO_PUBLIC_BIBLE_SERVER_URL in apps/app/.env.local. See apps/app/.env.example.",
  );

const appRequire = createRequire(
  new URL("../apps/app/package.json", import.meta.url),
);
const serverRequire = createRequire(
  new URL("../apps/server/package.json", import.meta.url),
);
const grouped = process.platform !== "win32";

function terminate(child) {
  if (!child?.pid || child.exitCode !== null) return;
  try {
    if (grouped) process.kill(-child.pid, "SIGTERM");
    else child.kill("SIGTERM");
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
let backend;
let app;
let stopping = false;

function stop() {
  if (stopping) return;
  stopping = true;
  terminate(backend);
  terminate(app);
}
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);

async function healthy() {
  try {
    const response = await fetch(new URL("/api/health", origin), {
      signal: AbortSignal.timeout(1500),
    });
    const value = await response.json();
    return (
      response.ok && value.status === "ok" && value.service === "selah-resource"
    );
  } catch {
    return false;
  }
}

try {
  if (!(await healthy())) {
    const url = new URL(origin);
    if (
      url.protocol !== "http:" ||
      !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ) {
      throw new Error(
        `The configured server is unavailable: ${origin}. Start it separately for a physical device or remote host.`,
      );
    }
    backend = spawn(
      process.execPath,
      [serverRequire.resolve("tsx/cli"), "watch", "src/main.ts"],
      {
        cwd: fileURLToPath(new URL("../apps/server/", import.meta.url)),
        detached: grouped,
        stdio: "inherit",
        env: { ...process.env, PORT: url.port || "80", HOST: "127.0.0.1" },
      },
    );
    backend.on("error", (error) => {
      console.error(error.message);
      process.exitCode = 1;
      stop();
    });
    backend.on("exit", (code) => {
      if (!stopping) {
        process.exitCode = code || 1;
        stop();
      }
    });
    const deadline = Date.now() + 30000;
    while (!stopping && !(await healthy())) {
      if (Date.now() > deadline)
        throw new Error(
          "The local server did not become ready within 30 seconds.",
        );
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    if (stopping)
      throw new Error("The local server stopped before becoming ready.");
  }
  app = spawn(
    process.execPath,
    [
      path.join(
        path.dirname(appRequire.resolve("expo/package.json")),
        "bin/cli",
      ),
      "start",
      ...process.argv.slice(2),
    ],
    {
      cwd: appRoot,
      detached: grouped,
      stdio: "inherit",
      env: process.env,
    },
  );
  app.on("error", (error) => {
    console.error(error.message);
    process.exitCode = 1;
    stop();
  });
  app.on("exit", (code) => {
    process.exitCode = code || 0;
    stop();
  });
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
  stop();
}
