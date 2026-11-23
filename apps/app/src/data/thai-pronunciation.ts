import { thaiPronunciationClip } from "./thai-pronunciation-data";

export async function thaiPronunciationUri(word: string) {
  const clip = await thaiPronunciationClip(word);
  return clip ? `data:audio/mp4;base64,${clip}` : null;
}
