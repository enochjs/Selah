import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { resolveListenOptions, resolveOptions } from "../src/common/options";
afterEach(() => vi.unstubAllEnvs());
it("resolves configured relative storage paths from the physical repository root", () => {
  const root = path.resolve(__dirname, "../../..");
  const settings = {
    CONTENT_ROOT: ["contentRoot", "custom/content"],
    MEDIA_ROOT: ["mediaRoot", "custom/media"],
    ADMIN_STATE_ROOT: ["stateRoot", "custom/admin"],
    RESOURCE_AUDIT_ROOT: ["auditRoot", "custom/audits"],
    TIMING_ROOT: ["timingRoot", "custom/timing"],
    ALIGNMENT_ROOT: ["alignmentRoot", "custom/alignment"],
    BIBLE_RESOURCE_ROOT: ["legacyRoot", "custom/legacy"],
  } as const;
  for (const [variable, [, value]] of Object.entries(settings))
    vi.stubEnv(variable, value);
  const options = resolveOptions();
  for (const [, [key, value]] of Object.entries(settings))
    expect(options[key]).toBe(path.join(root, value));
});
it("retains absolute configured paths and gives explicit application options priority", () => {
  vi.stubEnv("MEDIA_ROOT", "/media-mounted");
  vi.stubEnv("ADMIN_STATE_ROOT", "/admin-mounted");
  expect(resolveOptions().mediaRoot).toBe("/media-mounted");
  expect(resolveOptions({ stateRoot: "/injected-admin" }).stateRoot).toBe(
    "/injected-admin",
  );
});
it("validates listen settings before starting and supports compatibility variables", () => {
  vi.stubEnv("PORT", "");
  vi.stubEnv("HOST", "");
  vi.stubEnv("ADMIN_PORT", "9001");
  vi.stubEnv("ADMIN_HOST", "0.0.0.0");
  expect(resolveListenOptions()).toEqual({ port: 9001, host: "0.0.0.0" });
  vi.stubEnv("PORT", "9002");
  vi.stubEnv("HOST", "127.0.0.1");
  expect(resolveListenOptions()).toEqual({ port: 9002, host: "127.0.0.1" });
  for (const value of ["bad", "-1", "65536", "1.5"]) {
    vi.stubEnv("PORT", value);
    expect(() => resolveListenOptions()).toThrow("PORT");
  }
});
