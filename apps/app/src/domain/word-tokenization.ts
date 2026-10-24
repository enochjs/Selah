import { normalizeWord } from "./vocabulary";

const wordPattern = /^[a-z]+(?:['’\-][a-z]+)*$/i;

/** Preserve every source character while making punctuation-joined words distinct targets. */
export function tokenizeEnglishWords(
  text: string,
): { text: string; word: string | null }[] {
  return text
    .split(/([a-z]+(?:['’\-][a-z]+)*)/gi)
    .filter(Boolean)
    .map((part) => ({
      text: part,
      word: wordPattern.test(part) ? normalizeWord(part) : null,
    }));
}
