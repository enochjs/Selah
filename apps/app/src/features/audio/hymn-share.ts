import { Platform, Share } from "react-native";

export interface HymnShareContent {
  title: string;
  text: string;
  url: string;
}

export type HymnShareResult = "shared" | "copied" | "cancelled";

export async function presentHymnShare({
  title,
  text,
  url,
}: HymnShareContent): Promise<HymnShareResult> {
  const result = await Share.share(
    Platform.OS === "ios"
      ? { message: text, url }
      : { title, message: `${text}\n${url}` },
    { dialogTitle: title },
  );
  return result.action === Share.dismissedAction ? "cancelled" : "shared";
}
