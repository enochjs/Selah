import { beforeEach, expect, it, vi } from "vitest";
import type { ThemePreference } from "../src/domain/appearance";

const native = vi.hoisted(() => ({
  preference: "olive" as ThemePreference,
  setColorScheme: vi.fn(),
  setBackgroundColorAsync: vi.fn(async () => {}),
}));
vi.mock("react", () => ({ useEffect: (effect: () => void) => effect() }));
vi.mock("react-native", () => ({
  Appearance: { setColorScheme: native.setColorScheme },
}));
vi.mock("expo-system-ui", () => ({
  setBackgroundColorAsync: native.setBackgroundColorAsync,
}));
vi.mock("../src/state/app-store", () => ({
  useAppStore: (
    select: (state: { themePreference: ThemePreference }) => unknown,
  ) => select({ themePreference: native.preference }),
}));
vi.mock("../src/shared/theme-context", async () => {
  const { resolveTheme } = await import("../src/shared/theme-palettes");
  return { useTheme: () => resolveTheme(native.preference, "light") };
});
import { ThemeDocument } from "../src/shared/ThemeDocument";

beforeEach(() => {
  vi.clearAllMocks();
});
it.each([
  ["night", "dark", "#151C24"],
  ["mist", "light", "#F3F6F8"],
  ["redemption", "light", "#FAF6F1"],
  ["system", "auto", "#F8F7F3"],
] as const)(
  "applies %s to native appearance and the root surface",
  (preference, scheme, background) => {
    native.preference = preference;
    ThemeDocument();
    expect(native.setColorScheme).toHaveBeenCalledWith(scheme);
    expect(native.setBackgroundColorAsync).toHaveBeenCalledWith(background);
  },
);
