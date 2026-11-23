import entries from "@selah/content/dictionary.json";
import offlineEntries from "@selah/content/dictionary-offline.json";
import inflections from "@selah/content/dictionary-forms.json";
import thaiChinese from "@selah/content/thai-dictionary-zh.json";
import thaiScripture from "@selah/content/thai-scripture-glosses.json";
import { normalizeWord } from "../domain/vocabulary";
import type { DictionaryEntry } from "../domain/dictionary";

// Managed by the Selah admin dictionary publishing workflow.
export const dictionary: Record<
  string,
  { meaning: string; phonetic: string; type: string }
> = entries;

const offline: Record<string, string[]> = offlineEntries;
const forms: Record<string, string> = inflections;
const thaiEntries: Record<string, string[]> = thaiChinese.entries;
const scriptureGlosses: Record<string, string> = thaiScripture;
const own = <T>(record: Record<string, T>, word: string): T | undefined =>
  Object.hasOwn(record, word) ? record[word] : undefined;

export function lookupOffline(
  input: string,
  language = "en",
): DictionaryEntry | null {
  const word = normalizeWord(input).replace(/’/g, "'");
  if (language === "th") {
    const thai = own(thaiEntries, word);
    if (!thai) {
      const meaning = own(scriptureGlosses, word);
      if (!meaning) return null;
      const types = new Set(
        meaning.split("\n").map((line) => line.split("：", 1)[0]),
      );
      return {
        word,
        lemma: word,
        meaning,
        phonetic: "",
        type: [...types].join("、"),
        source: "Selah",
        language: "zh",
      };
    }
    const [meaning, phonetic, type] = thai;
    return {
      word,
      lemma: word,
      meaning,
      phonetic,
      type,
      source: "Wiktionary",
      language: "zh",
      attribution: [
        {
          name: "中文维基词典",
          url: `${thaiChinese.source}wiki/${encodeURIComponent(word)}`,
        },
        { name: "CC BY-SA 4.0", url: thaiChinese.license },
      ],
    };
  }
  if (language !== "en") return null;
  const bare = word.replace(/'s$/, "");
  const lemma = own(forms, bare) ?? bare;
  const curated = own(dictionary, bare) ?? own(dictionary, lemma);
  if (curated)
    return { ...curated, word, lemma, source: "Selah", language: "zh" };
  const direct = own(offline, bare);
  const root = own(offline, lemma);
  const row = direct ?? root;
  if (!row) return null;
  return {
    word,
    lemma,
    meaning:
      row[0] +
      (direct && root && lemma !== bare ? `\n\n${lemma}：${root[0]}` : ""),
    phonetic: row[1] ? `/${row[1]}/` : "",
    type: row[2] || root?.[2] || "",
    source: "ECDICT",
    language: "zh",
  };
}
