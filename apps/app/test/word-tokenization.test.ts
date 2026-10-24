import { expect, it } from "vitest";
import { tokenizeEnglishWords } from "../src/domain/word-tokenization";

it("separates words joined by punctuation without changing the Scripture text", () => {
  const text = "the valley,I will fear no evil;you are with me.";
  const tokens = tokenizeEnglishWords(text);
  expect(tokens.map((token) => token.text).join("")).toBe(text);
  expect(tokens.flatMap((token) => (token.word ? [token.word] : []))).toEqual([
    "the",
    "valley",
    "i",
    "will",
    "fear",
    "no",
    "evil",
    "you",
    "are",
    "with",
    "me",
  ]);
});
it("keeps contractions and hyphenated words intact and punctuation unclickable", () => {
  const tokens = tokenizeEnglishWords("“Don’t fear”—the half-tribe’s 12 men.");
  expect(
    tokens.filter((token) => token.word).map((token) => token.word),
  ).toEqual(["don’t", "fear", "the", "half-tribe’s", "men"]);
  expect(tokens.find((token) => token.text === " 12 ")?.word).toBeNull();
});
