import { useLayoutEffect } from "react";
import { useTheme } from "./theme-context";

export function ThemeDocument() {
  const theme = useTheme();
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--selah-background", theme.colors.background);
    root.style.setProperty("--selah-focus", theme.colors.primary);
    root.style.setProperty("--selah-selection", theme.colors.readingActive);
    root.style.setProperty("--selah-scrollbar", theme.colors.border);
    root.style.colorScheme = theme.colorScheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", theme.colors.background);
  }, [theme]);
  return null;
}
