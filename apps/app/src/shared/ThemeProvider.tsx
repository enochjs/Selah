import React, { type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { StatusBar } from "expo-status-bar";
import { useAppStore } from "../state/app-store";
import { resolveTheme } from "./theme-palettes";
import { ThemeContext } from "./theme-context";
import { ThemeDocument } from "./ThemeDocument";

export function ThemeProvider({ children }: PropsWithChildren) {
  const preference = useAppStore((state) => state.themePreference);
  const systemScheme = useColorScheme();
  const theme = resolveTheme(preference, systemScheme);
  return (
    <ThemeContext value={theme}>
      <StatusBar style={theme.colorScheme === "dark" ? "light" : "dark"} />
      <ThemeDocument />
      {children}
    </ThemeContext>
  );
}
