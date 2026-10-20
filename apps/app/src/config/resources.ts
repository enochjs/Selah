import Constants from "expo-constants";
import { Platform } from "react-native";
export function resourceServerUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_BIBLE_SERVER_URL?.trim();
  if (!configured) return null;
  try {
    const url = new URL(configured);
    if (!["http:", "https:"].includes(url.protocol)) return null;
    // Expo Go on a phone must address the development computer, not its own loopback.
    if (
      Platform.OS !== "web" &&
      ["localhost", "127.0.0.1"].includes(url.hostname)
    ) {
      const host = Constants.expoConfig?.hostUri;
      if (host) url.hostname = new URL(`http://${host}`).hostname;
    }
    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}
export function resourceUrl(path: string): string | null {
  const origin = resourceServerUrl();
  return origin ? new URL(path, origin).toString() : null;
}
