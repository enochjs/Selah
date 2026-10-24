import entries from "@selah/content/dictionary.json";
import offlineEntries from "@selah/content/dictionary-offline.json";
import inflections from "@selah/content/dictionary-forms.json";
import { normalizeWord } from "../domain/vocabulary";
import type { DictionaryEntry } from "../domain/dictionary";

// Managed by the Selah admin dictionary publishing workflow.
export const dictionary: Record<
  string,
  { meaning: string; phonetic: string; type: string }
> = entries;

const offline: Record<string, string[]> = offlineEntries;
const forms: Record<string, string> = inflections;
const own = <T>(record: Record<string, T>, word: string): T | undefined =>
  Object.hasOwn(record, word) ? record[word] : undefined;

export function lookupOffline(input: string): DictionaryEntry | null {
  const word = normalizeWord(input).replace(/’/g, "'");
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
