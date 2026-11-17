import { validUsageEvent, type UsageEvent } from "../domain/usage";
interface UsageIdentity {
  platform: "android" | "ios" | "web";
  version: string;
}
interface UsageBatch extends UsageIdentity {
  deviceId: string;
  events: UsageEvent[];
}
interface QueuedUsageEvent extends UsageIdentity {
  event: UsageEvent;
}
interface UsagePort {
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  id(): string;
  now(): number;
  send(batch: UsageBatch): Promise<void>;
}
export function createUsageClient(port: UsagePort, identity: UsageIdentity) {
  let deviceId = "";
  let events: QueuedUsageEvent[] = [];
  const recent = (event: UsageEvent) =>
    event.at >= port.now() - 7 * 86400000 && event.at <= port.now() + 300000;
  let pending = Promise.resolve().then(async () => {
    try {
      const raw: unknown = JSON.parse((await port.read()) || "null");
      if (
        raw &&
        typeof raw === "object" &&
        "deviceId" in raw &&
        typeof raw.deviceId === "string" &&
        /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
          raw.deviceId,
        )
      ) {
        deviceId = raw.deviceId;
        if ("events" in raw && Array.isArray(raw.events)) {
          events = raw.events
            .filter((row: unknown): row is QueuedUsageEvent => {
              if (
                !row ||
                typeof row !== "object" ||
                !("event" in row) ||
                !("version" in row) ||
                !("platform" in row)
              )
                return false;
              return (
                validUsageEvent(row.event) &&
                recent(row.event) &&
                typeof row.version === "string" &&
                /^[a-zA-Z0-9.+-]{1,40}$/.test(row.version) &&
                ["android", "ios", "web"].includes(String(row.platform))
              );
            })
            .slice(-2000);
        }
      }
    } catch {
      // A damaged or unavailable analytics cache must not interrupt the application.
    }
    deviceId ||= port.id();
  });
  const save = () => port.write(JSON.stringify({ deviceId, events }));
  const enqueue = (operation: () => Promise<void>) => {
    pending = pending.then(operation).catch(() => {});
    return pending;
  };
  return {
    record(event: UsageEvent) {
      return enqueue(async () => {
        if (!validUsageEvent(event) || !recent(event)) return;
        events = [
          ...events.filter((row) => recent(row.event)),
          { ...identity, event },
        ].slice(-2000);
        await save();
      });
    },
    flush() {
      return enqueue(async () => {
        events = events.filter((row) => recent(row.event));
        for (
          let batchNumber = 0;
          events.length && batchNumber < 4;
          batchNumber++
        ) {
          const first = events[0];
          const boundary = events.findIndex(
            (row) =>
              row.version !== first.version || row.platform !== first.platform,
          );
          const batch = events.slice(
            0,
            Math.min(50, boundary < 0 ? events.length : boundary),
          );
          // Keep durable event IDs until the server acknowledges the whole batch.
          await port.send({
            platform: first.platform,
            version: first.version,
            deviceId,
            events: batch.map((row) => row.event),
          });
          events = events.slice(batch.length);
          await save();
        }
      });
    },
  };
}
