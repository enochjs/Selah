export const usagePages = [
  "/",
  "/bible",
  "/music",
  "/me",
  "/now-playing",
  "/downloads",
  "/settings",
  "/about",
  "/vocabulary",
  "/review",
  "/updates",
];
export interface UsageEvent {
  id: string;
  at: number;
  sessionId: string;
  type: "visit" | "view" | "active" | "listen";
  page: string;
  seconds: number;
  kind?: "hymn" | "scripture";
  contentId?: string;
}
export interface UsageSnapshot {
  foreground: boolean;
  page: string;
  listening: { kind: "hymn" | "scripture"; contentId: string } | null;
}
export function validUsageEvent(value: unknown): value is UsageEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  const identifier = (text: unknown) =>
    typeof text === "string" && /^[a-zA-Z0-9-]{1,80}$/.test(text);
  return (
    identifier(event.id) &&
    identifier(event.sessionId) &&
    typeof event.at === "number" &&
    Number.isSafeInteger(event.at) &&
    event.at >= 0 &&
    typeof event.page === "string" &&
    usagePages.includes(event.page) &&
    typeof event.seconds === "number" &&
    Number.isInteger(event.seconds) &&
    event.seconds >= 0 &&
    event.seconds <= 60 &&
    ["visit", "view", "active", "listen"].includes(String(event.type)) &&
    (event.type === "listen"
      ? ["hymn", "scripture"].includes(String(event.kind)) &&
        typeof event.contentId === "string" &&
        /^[a-zA-Z0-9][a-zA-Z0-9:.-]{0,119}$/.test(event.contentId) &&
        event.seconds > 0
      : event.kind === undefined &&
        event.contentId === undefined &&
        (event.type === "active" ? event.seconds > 0 : event.seconds === 0)) &&
    Object.keys(event).every((key) =>
      [
        "id",
        "at",
        "sessionId",
        "type",
        "page",
        "seconds",
        "kind",
        "contentId",
      ].includes(key),
    )
  );
}

/** Sample short clock intervals and retain fractional time until the next upload. */
export function createUsageSampler(
  record: (event: UsageEvent) => void,
  id: () => string,
) {
  let previous: UsageSnapshot | undefined;
  let lastAt = 0;
  let lastForegroundAt = 0;
  let lastFlushedAt = 0;
  let sessionId = id();
  const durations = new Map<
    string,
    { event: Omit<UsageEvent, "id" | "at" | "seconds">; milliseconds: number }
  >();
  const add = (
    type: "active" | "listen",
    milliseconds: number,
    state: UsageSnapshot,
  ) => {
    const event = {
      type,
      sessionId,
      page: state.page,
      ...(type === "listen" ? state.listening : {}),
    };
    const key = JSON.stringify([
      sessionId,
      type,
      type === "listen" ? state.listening : null,
    ]);
    const duration = durations.get(key) ?? { event, milliseconds: 0 };
    duration.milliseconds += milliseconds;
    durations.set(key, duration);
  };
  const flush = (now: number) => {
    for (const [key, duration] of durations) {
      while (duration.milliseconds >= 1000) {
        const seconds = Math.min(60, Math.floor(duration.milliseconds / 1000));
        record({ ...duration.event, id: id(), at: now, seconds });
        duration.milliseconds -= seconds * 1000;
      }
      if (!duration.milliseconds) durations.delete(key);
    }
    lastFlushedAt = now;
  };
  return {
    flush,
    update(next: UsageSnapshot, now: number) {
      const elapsed = now - lastAt;
      const resuming = previous && !previous.foreground && next.foreground;
      // Delayed ticks and lifecycle resume cannot prove continuous activity.
      if (previous && elapsed > 0 && elapsed <= 1500 && !resuming) {
        if (previous.foreground) add("active", elapsed, previous);
        if (previous.listening) add("listen", elapsed, previous);
      }
      if (next.foreground) {
        const newVisit =
          !previous ||
          (!previous.foreground && now - lastForegroundAt >= 30 * 60000);
        if (newVisit) {
          flush(now);
          durations.clear();
          sessionId = id();
          record({
            id: id(),
            at: now,
            sessionId,
            type: "visit",
            page: next.page,
            seconds: 0,
          });
        }
        if (newVisit || previous?.page !== next.page || !previous?.foreground)
          record({
            id: id(),
            at: now,
            sessionId,
            type: "view",
            page: next.page,
            seconds: 0,
          });
        lastForegroundAt = now;
      } else if (previous?.foreground) lastForegroundAt = now;
      previous = next;
      lastAt = now;
      if (now - lastFlushedAt >= 30000) flush(now);
    },
  };
}
