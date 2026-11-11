import { expect, it } from "vitest";
import { formatDailyVerseText } from "../src/features/daily-verse/format-scripture";

it.each([
  [
    "“ ‘ “The LORD bless you and keep you;",
    "“The LORD bless you and keep you;",
  ],
  [
    '" \' "The LORD bless you and keep you;',
    '"The LORD bless you and keep you;',
  ],
  ["“\u00a0‘\t“Bless you;", "“Bless you;"],
])(
  "simplifies consecutive opening quotes in an English excerpt: %s",
  (text, expected) => {
    expect(formatDailyVerseText(text, "en")).toBe(expected);
  },
);

it.each([
  "“The LORD bless you and keep you;",
  "‘Tis a blessing.",
  "He said, “ ‘Bless you.’ ”",
  "The LORD’s blessing.",
  "“First line.\n‘Second line.’”",
  "",
])(
  "preserves single quotes, internal punctuation and line breaks: %s",
  (text) => {
    expect(formatDailyVerseText(text, "en")).toBe(text);
  },
);

it("keeps Chinese text unchanged", () => {
  const text = "“ ‘ “愿耶和华赐福给你，保护你。";
  expect(formatDailyVerseText(text, "zh")).toBe(text);
});
