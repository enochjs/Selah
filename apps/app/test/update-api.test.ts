import { expect, it, vi } from "vitest";
import { fetchUpdateRelease } from "../src/data/update-api";
import type { InstalledApp } from "../src/domain/app-updates";
const installed: InstalledApp = {
  platform: "android",
  channel: "direct",
  appId: "app.selah.bible",
  version: "1.0.0",
  buildNumber: 1,
};
it("queries native build and channel and accepts a genuine no-update response", async () => {
  const request = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () =>
      new Response(JSON.stringify({ release: null }), {
        headers: { "Content-Type": "application/json" },
      }),
  );
  expect(
    await fetchUpdateRelease(installed, "https://www.enochjs.top", request),
  ).toBeNull();
  expect(request.mock.calls[0][0]).toBe(
    "https://www.enochjs.top/api/app-updates?platform=android&channel=direct&buildNumber=1",
  );
});
it("does not confuse HTTP or malformed response failures with latest", async () => {
  for (const response of [
    new Response("", { status: 404 }),
    new Response("{}"),
    new Response('{"release":false}'),
    new Response("oops"),
  ]) {
    await expect(
      fetchUpdateRelease(
        installed,
        "https://www.enochjs.top",
        async () => response,
      ),
    ).rejects.toThrow();
  }
});
it("rejects insecure or missing update service and unsupported web updates", async () => {
  const request = vi.fn();
  for (const endpoint of [
    null,
    "http://example.com",
    "https://user:secret@example.com",
    "ftp://example.com",
  ])
    await expect(
      fetchUpdateRelease(installed, endpoint, request),
    ).rejects.toThrow();
  await expect(
    fetchUpdateRelease(
      { ...installed, platform: "web" },
      "https://www.enochjs.top",
      request,
    ),
  ).rejects.toThrow();
  expect(request).not.toHaveBeenCalled();
});
