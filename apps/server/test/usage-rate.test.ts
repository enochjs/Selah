import { expect, it } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { UsageRateGuard } from "../src/usage/usage-rate.guard";
const context = (deviceId: string) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({
        ip: "127.0.0.1",
        body: { deviceId },
        is: () => true,
      }),
    }),
  }) as unknown as ExecutionContext;
it("allows independent installations behind the same proxy while throttling one installation", () => {
  const guard = new UsageRateGuard();
  for (let index = 0; index < 150; index++)
    expect(
      guard.canActivate(
        context(`12345678-1234-4234-8234-${String(index).padStart(12, "0")}`),
      ),
    ).toBe(true);
  const sameDevice = context("22345678-1234-4234-8234-123456789012");
  for (let index = 0; index < 120; index++) guard.canActivate(sameDevice);
  expect(() => guard.canActivate(sameDevice)).toThrow("请求过于频繁");
});
