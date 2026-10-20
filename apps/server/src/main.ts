import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
import { createApplication } from "./app";
import { AuthService } from "./auth/auth.service";
import { resolveListenOptions } from "./common/options";

export function loadEnvironment() {
  const root = path.resolve(__dirname, "..");
  const values: Record<string, string> = {};
  for (const name of [".env", ".env.local"]) {
    const file = path.join(root, name);
    if (existsSync(file))
      Object.assign(values, parseEnv(readFileSync(file, "utf8")));
  }
  for (const [key, value] of Object.entries(values))
    if (process.env[key] === undefined) process.env[key] = value;
}

export async function main() {
  loadEnvironment();
  const { port, host } = resolveListenOptions();
  const app = await createApplication();
  await app.listen(port, host);
  console.log(`Selah server: http://${host}:${port}/admin/`);
  const auth = app.get(AuthService);
  if (auth.generatedPassword)
    console.log(`Initial password (shown once): ${auth.generatedPassword}`);
  app.enableShutdownHooks();
}

if (require.main === module) void main();
