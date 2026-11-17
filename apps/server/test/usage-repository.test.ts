import { expect, it } from "vitest";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { resolveOptions } from "../src/common/options";
import type { UsageBatch } from "../src/domain/usage";
import { usageDays } from "../src/domain/usage";
import { UsageRepository } from "../src/usage/usage.repository";

it("retains acknowledged rows and deduplication across restart, rolls back a partial batch, and prunes old rows", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "selah-usage-db-"));
  const options = resolveOptions({ stateRoot: root });
  let repository = new UsageRepository(options);
  const batch: UsageBatch = {
    deviceId: "12345678-1234-4234-8234-123456789012",
    platform: "android",
    version: "1",
    events: [
      {
        id: "visit",
        at: Date.now(),
        sessionId: "session",
        type: "visit",
        page: "/",
        seconds: 0,
      },
    ],
  };
  try {
    await repository.onModuleInit();
    expect(repository.append(batch)).toEqual({ accepted: 1 });
    expect(() =>
      repository.append({
        ...batch,
        events: [
          { ...batch.events[0], id: "new" },
          {
            ...batch.events[0],
            id: "invalid",
            page: null as unknown as string,
          },
        ],
      }),
    ).toThrow();
    expect(repository.dashboard(usageDays(7)).totals.sessions).toBe(1);
    repository.append({
      ...batch,
      events: [
        { ...batch.events[0], id: "old", at: Date.now() - 91 * 86400000 },
      ],
    });
    repository.onModuleDestroy();
    repository = new UsageRepository(options);
    await repository.onModuleInit();
    expect(repository.append(batch)).toEqual({ accepted: 0 });
    expect(repository.dashboard(usageDays(7)).totals.devices).toBe(1);
    expect(
      repository.dashboard(usageDays(1, Date.now() - 91 * 86400000)).totals
        .devices,
    ).toBe(0);
    expect(
      (await stat(path.join(root, "usage", "usage.sqlite"))).mode & 0o777,
    ).toBe(0o600);
  } finally {
    repository.onModuleDestroy();
    await rm(root, { recursive: true, force: true });
  }
});
