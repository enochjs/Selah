import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";

async function unusedPort() {
  const listener = createServer();
  await new Promise<void>((resolve) =>
    listener.listen(0, "127.0.0.1", resolve),
  );
  const address = listener.address();
  if (!address || typeof address === "string") throw new Error("No test port");
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

async function stop(child: ChildProcess) {
  const exited = new Promise<void>((resolve) =>
    child.once("exit", () => resolve()),
  );
  if (child.exitCode !== null || !child.pid) return;
  process.kill(-child.pid, "SIGTERM");
  await exited;
}

it("runs the real development command with query defaults and strict DTO validation", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selah-dev-server-"));
  const contentRoot = path.join(root, "content");
  await mkdir(contentRoot);
  for (const [name, value] of Object.entries({
    "bible.json": [
      {
        id: "genesis",
        en: "Genesis",
        zh: "创世记",
        testament: "old",
        chapters: [[{ number: 1, en: "In the beginning", zh: "起初" }]],
      },
    ],
    "chapter-audio.json": {},
    "resource-manifest.json": {},
    "dictionary.json": {},
  }))
    await writeFile(path.join(contentRoot, name), JSON.stringify(value));
  const port = await unusedPort();
  const base = `http://127.0.0.1:${port}`;
  const npmCli = process.env.npm_execpath;
  if (!npmCli) throw new Error("Run this test through npm test");
  const child = spawn(
    process.execPath,
    [npmCli, "run", "dev", "--workspace", "@selah/server"],
    {
      cwd: path.resolve(__dirname, "../../.."),
      detached: true,
      env: {
        ...process.env,
        PORT: String(port),
        HOST: "127.0.0.1",
        CONTENT_ROOT: contentRoot,
        ADMIN_STATE_ROOT: path.join(root, "state"),
        MEDIA_ROOT: path.join(root, "media"),
        ADMIN_USERNAME: "admin",
        ADMIN_PASSWORD: "development-test-password",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let output = "";
  child.stdout?.on("data", (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-8000);
  });
  child.stderr?.on("data", (chunk: Buffer) => {
    output = (output + chunk.toString()).slice(-8000);
  });
  try {
    const deadline = Date.now() + 20000;
    for (;;) {
      if (child.exitCode !== null || Date.now() > deadline)
        throw new Error(`Development server failed to start: ${output}`);
      try {
        if (
          (
            await fetch(`${base}/api/health`, {
              signal: AbortSignal.timeout(500),
            })
          ).ok
        )
          break;
      } catch {
        /* Startup is asynchronous. */
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const login = await fetch(`${base}/api/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: "admin",
        password: "development-test-password",
      }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const { csrf } = await login.json();
    const headers = {
      Cookie: cookie,
      "Content-Type": "application/json",
      "X-CSRF-Token": csrf,
    };
    for (const route of ["scripture", "recordings", "dictionary", "hymns"]) {
      const response = await fetch(`${base}/api/admin/${route}`, { headers });
      expect(response.status, `${route} default query`).toBe(200);
      const data = await response.json();
      expect(data.page).toBe(1);
      expect(data.pageSize).toBe(20);
      expect(
        (await fetch(`${base}/api/admin/${route}?page=bad`, { headers }))
          .status,
      ).toBe(400);
      expect(
        (await fetch(`${base}/api/admin/${route}?unexpected=true`, { headers }))
          .status,
      ).toBe(400);
    }
    const review = await fetch(`${base}/api/admin/reviews`, {
      method: "PUT",
      headers,
      body: JSON.stringify({
        key: "genesis:1:1",
        status: "approved",
        note: "",
        unexpected: true,
      }),
    });
    expect(review.status).toBe(400);
  } finally {
    await stop(child);
    await rm(root, { recursive: true, force: true });
  }
}, 30000);
