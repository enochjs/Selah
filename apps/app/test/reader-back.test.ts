import { expect, it } from "vitest";
import { ReaderBackGuard } from "../src/features/reader/reader-back";

it("keeps the first accidental system-back gesture in the reader", () => {
  const guard = new ReaderBackGuard();
  expect(guard.handle(1000)).toBe(true);
  expect(guard.handle(1400)).toBe(false);
});
it("requires a fresh confirmation after the 1.5-second window expires", () => {
  const guard = new ReaderBackGuard();
  expect(guard.handle(1000)).toBe(true);
  expect(guard.handle(2600)).toBe(true);
  expect(guard.handle(3000)).toBe(false);
});
it("does not treat a body chapter turn as the first back gesture", () => {
  const guard = new ReaderBackGuard();
  expect(guard.handle(1000, "genesis:1")).toBe(true);
  expect(guard.handle(1100, "genesis:2")).toBe(true);
});
