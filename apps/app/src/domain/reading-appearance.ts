export const readingFontSizes = [14, 16, 18, 20, 24] as const;
export const defaultReadingFontSize = 16;

export function restoreReadingFontSize(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(24, Math.max(14, value))
    : defaultReadingFontSize;
}
