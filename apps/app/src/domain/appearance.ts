export const themeIds = ["olive", "mist", "night", "redemption"] as const;
export type ThemeId = (typeof themeIds)[number];
export type ThemePreference = ThemeId | "system";

export function restoreThemePreference(value: unknown): ThemePreference {
  if (value === "system" || themeIds.some((id) => id === value)) {
    return value as ThemePreference;
  }
  return "olive";
}
