export async function thaiPronunciationClip(word: string) {
  const { default: bank } =
    await import("@selah/content/thai-pronunciations.json");
  const clips: Readonly<Record<string, string>> = bank.audio;
  return Object.hasOwn(clips, word) ? clips[word] : null;
}
