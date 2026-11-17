import { createContext, useContext } from "react";
import { themes } from "./theme-palettes";

export const ThemeContext = createContext(themes.olive);

export function useTheme() {
  return useContext(ThemeContext);
}
