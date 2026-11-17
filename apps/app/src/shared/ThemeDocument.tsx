import { useEffect } from "react";
import { Appearance } from "react-native";
import { setBackgroundColorAsync } from "expo-system-ui";
import { useAppStore } from "../state/app-store";
import { useTheme } from "./theme-context";
import { themes } from "./theme-palettes";

export function ThemeDocument() {
  const preference = useAppStore((state) => state.themePreference);
  const { colors } = useTheme();
  useEffect(() => {
    Appearance.setColorScheme(
      preference === "system" ? "auto" : themes[preference].colorScheme,
    );
  }, [preference]);
  useEffect(() => {
    void setBackgroundColorAsync(colors.background).catch(() => {
      console.warn("Could not update the native background color.");
    });
  }, [colors.background]);
  return null;
}
