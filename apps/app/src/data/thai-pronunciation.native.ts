import { File, Paths } from "expo-file-system";
import { thaiPronunciationClip } from "./thai-pronunciation-data";

export async function thaiPronunciationUri(word: string) {
  const clip = await thaiPronunciationClip(word);
  if (!clip) return null;
  const file = new File(
    Paths.cache,
    `selah-th-v1-${encodeURIComponent(word)}.m4a`,
  );
  await file.write(clip, { encoding: "base64" });
  return file.uri;
}
