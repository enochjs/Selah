import type { RepeatMode } from "./models";
export function nextTrackIndex(
  current: number,
  count: number,
  repeat: RepeatMode,
): number | null {
  if (count <= 0 || current < 0 || current >= count) return null;
  if (repeat === "verse") return current;
  if (current + 1 < count) return current + 1;
  return repeat === "chapter" ? 0 : null;
}
export function formatTime(seconds: number): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}
