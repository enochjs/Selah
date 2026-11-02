import { Platform } from "react-native";

export const systemFontFamily = Platform.OS === "ios" ? "System" : "sans-serif";
