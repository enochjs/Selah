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
] as const;

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
export interface UsageBatch {
  deviceId: string;
  platform: "android" | "ios" | "web";
  version: string;
  events: UsageEvent[];
}
export function usageDay(at: number): string {
  return new Date(at + 8 * 3600000).toISOString().slice(0, 10);
}
export function usageDays(days: number, now = Date.now()): string[] {
  return Array.from({ length: days }, (_, i) =>
    usageDay(now - (days - i - 1) * 86400000),
  );
}
