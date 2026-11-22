import { requireOptionalNativeModule } from "expo";
import { tokenizeWords } from "../domain/word-tokenization";

const wordSegmentation = requireOptionalNativeModule<{
  segment: (text: string, language: string) => string[];
}>("SelahWordSegmentation");

export function tokenizeScriptureWords(text: string, language: string) {
  return tokenizeWords(
    text,
    language,
    wordSegmentation
      ? (value, tag) => wordSegmentation.segment(value, tag)
      : undefined,
  );
}
