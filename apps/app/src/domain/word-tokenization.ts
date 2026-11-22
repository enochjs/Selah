import { normalizeWord } from "./vocabulary";

const wordPart = String.raw`\p{L}[\p{L}\p{M}]*(?:['’-]\p{L}[\p{L}\p{M}]*)*`;
const wordPattern = new RegExp(`^${wordPart}$`, "u");
const wordSeparator = new RegExp(`(${wordPart})`, "u");
const segmenters = new Map<string, Intl.Segmenter>();
const scriptWithNoWordSpaces =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Lao}\p{Script=Khmer}\p{Script=Myanmar}]/u;

function token(text: string) {
  return { text, word: isLookupWord(text) ? normalizeWord(text) : null };
}

export function isLookupWord(text: string): boolean {
  return wordPattern.test(text);
}

/** Preserve every source character while making punctuation-joined words distinct targets. */
export function tokenizeWords(
  text: string,
  language: string,
  segmentWords?: (text: string, language: string) => string[],
) {
  if (scriptWithNoWordSpaces.test(text)) {
    if (segmentWords) return segmentWords(text, language).map(token);
    if (typeof Intl.Segmenter === "function") {
      let segmenter = segmenters.get(language);
      if (!segmenter) {
        segmenter = new Intl.Segmenter(language, { granularity: "word" });
        segmenters.set(language, segmenter);
      }
      return Array.from(segmenter.segment(text), ({ segment }) =>
        token(segment),
      );
    }
    // Older engines can still look up individual characters in unspaced scripts.
    return text
      .split(wordSeparator)
      .filter(Boolean)
      .flatMap((part) =>
        scriptWithNoWordSpaces.test(part)
          ? (part.match(/.\p{M}*/gu) ?? []).map(token)
          : [token(part)],
      );
  }
  return text.split(wordSeparator).filter(Boolean).map(token);
}
