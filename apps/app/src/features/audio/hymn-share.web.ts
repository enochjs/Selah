import type { HymnShareContent, HymnShareResult } from "./hymn-share";

export async function presentHymnShare(
  content: HymnShareContent,
): Promise<HymnShareResult> {
  if (navigator.share) {
    try {
      await navigator.share(content);
      return "shared";
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError")
        return "cancelled";
    }
  }
  await navigator.clipboard.writeText(content.url);
  return "copied";
}
