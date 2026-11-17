import { expect, it } from "vitest";
import { createUsageClient } from "../src/data/usage-client";
import { createUsageSampler } from "../src/domain/usage";

it("measures foreground and listening separately, ignores suspended time and starts a new visit after 30 minutes away", () => {
  let sequence = 0;
  const events: { type: string; seconds: number; contentId?: string }[] = [];
  const sample = createUsageSampler(
    (event) => events.push(event),
    () => `id-${++sequence}`,
  );
  const active = {
    foreground: true,
    page: "/music",
    listening: { kind: "hymn" as const, contentId: "amazing-grace" },
  };
  sample.update(active, 0);
  for (let now = 1000; now < 40000; now += 1000) sample.update(active, now);
  sample.update({ ...active, foreground: false }, 40000);
  for (let now = 41000; now <= 70000; now += 1000)
    sample.update({ ...active, foreground: false }, now);
  sample.flush(70000);
  expect(
    events
      .filter((event) => event.type === "active")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(40);
  expect(
    events
      .filter((event) => event.type === "listen")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(70);
  sample.update(active, 2_000_000);
  expect(events.filter((event) => event.type === "visit")).toHaveLength(2);
  expect(
    events
      .filter((event) => event.type === "listen")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(70);
  for (let now = 2_001_000; now < 2_010_000; now += 1000)
    sample.update(active, now);
  sample.update({ ...active, listening: null, page: "/bible" }, 2_010_000);
  for (let now = 2_011_000; now <= 2_040_000; now += 1000)
    sample.update({ ...active, listening: null, page: "/bible" }, now);
  sample.flush(2_040_000);
  expect(events.filter((event) => event.type === "view")).toHaveLength(3);
  expect(
    events
      .filter((event) => event.type === "listen")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(80);
});

it("preserves fractional seconds across frequent navigation and drops short suspended gaps", () => {
  let sequence = 0;
  const events: { type: string; seconds: number }[] = [];
  const sample = createUsageSampler(
    (event) => events.push(event),
    () => `id-${++sequence}`,
  );
  const state = {
    foreground: true,
    page: "/music",
    listening: { kind: "hymn" as const, contentId: "grace" },
  };
  sample.update(state, 0);
  for (let now = 600; now <= 60000; now += 600)
    sample.update({ ...state, page: now % 1200 ? "/music" : "/bible" }, now);
  expect(
    events
      .filter((event) => event.type === "active")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(60);
  expect(
    events
      .filter((event) => event.type === "listen")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(60);
  sample.update({ ...state, foreground: false }, 61000);
  sample.update({ ...state, listening: null }, 106000);
  sample.flush(106000);
  expect(
    events
      .filter((event) => event.type === "listen")
      .reduce((sum, event) => sum + event.seconds, 0),
  ).toBe(61);
});

it("persists anonymous identity and failed batches, then retries the same event IDs after restart", async () => {
  let saved: string | null = null;
  let online = false;
  const sent: {
    deviceId: string;
    version: string;
    events: { id: string }[];
  }[] = [];
  const port = {
    read: async () => saved,
    write: async (value: string) => {
      saved = value;
    },
    id: () => "12345678-1234-4234-8234-123456789012",
    now: () => 100000,
    send: async (batch: {
      deviceId: string;
      version: string;
      events: { id: string }[];
    }) => {
      sent.push(batch);
      if (!online) throw new Error("offline");
    },
  };
  const client = createUsageClient(port, {
    platform: "android",
    version: "1.0.0",
  });
  await client.record({
    id: "event-1",
    sessionId: "session-1",
    at: 100000,
    type: "visit",
    seconds: 0,
    page: "/music",
  });
  await client.flush();
  expect(JSON.parse(saved!).events).toHaveLength(1);
  online = true;
  const restored = createUsageClient(port, {
    platform: "android",
    version: "1.0.1",
  });
  await restored.flush();
  expect(sent[1].deviceId).toBe(sent[0].deviceId);
  expect(sent[1].events[0].id).toBe("event-1");
  expect(sent[1].version).toBe("1.0.0");
  expect(JSON.parse(saved!).events).toEqual([]);
});

it("keeps concurrent records during an upload and discards expired or corrupt cached records", async () => {
  let saved: string | null = JSON.stringify({
    deviceId: "12345678-1234-4234-8234-123456789012",
    events: [
      { id: "expired", at: 0 },
      { id: "bad", at: 700000000 },
    ],
  });
  const sent: unknown[] = [];
  const client = createUsageClient(
    {
      read: async () => saved,
      write: async (value) => {
        saved = value;
      },
      id: () => "12345678-1234-4234-8234-123456789012",
      now: () => 700000000,
      send: async (batch) => {
        sent.push(batch);
      },
    },
    { platform: "web", version: "1" },
  );
  const event = {
    id: "first",
    sessionId: "session",
    at: 700000000,
    type: "view" as const,
    seconds: 0,
    page: "/",
  };
  await client.record(event);
  await Promise.all([
    client.flush(),
    client.record({ ...event, id: "second" }),
  ]);
  expect(
    JSON.parse(saved!).events.map(
      (row: { event: { id: string } }) => row.event.id,
    ),
  ).toEqual(["second"]);
  expect(sent).toHaveLength(1);
});
