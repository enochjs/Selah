import { compatibleFetch } from "./update-compatibility";
import type { DictionaryEntry } from "../domain/dictionary";

let toTraditional: ((word: string) => string) | undefined;

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
function license(value: unknown): { name: string; url: string }[] {
  const row = object(value);
  return row &&
    typeof row.name === "string" &&
    typeof row.url === "string" &&
    row.url.startsWith("https://")
    ? [{ name: row.name, url: row.url }]
    : [];
}

/** Only the selected word leaves the device; saved notes and verses stay local. */
export async function lookupOnline(
  word: string,
  language = "en",
): Promise<DictionaryEntry | null> {
  const baseLanguage = language.split("-")[0].toLowerCase();
  const useEnglishDictionary =
    baseLanguage === "en" && /^[a-z'-]+$/i.test(word);
  const endpoint = useEnglishDictionary
    ? "https://api.dictionaryapi.dev/api/v2/entries"
    : "https://freedictionaryapi.com/api/v1/entries";
  let headword = word;
  if (baseLanguage === "zh") {
    if (!toTraditional) {
      const { Converter } = await import("opencc-js/cn2t");
      toTraditional = Converter({ from: "cn", to: "t" });
    }
    headword = toTraditional(word);
  }
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    useEnglishDictionary ? 6000 : 12000,
  );
  try {
    for (const candidate of new Set([headword, word])) {
      const response = await compatibleFetch(
        `${endpoint}/${encodeURIComponent(baseLanguage)}/${encodeURIComponent(candidate)}`,
        {
          signal: controller.signal,
          credentials: "omit",
        },
      );
      if (response.status === 404) continue;
      if (!response.ok) throw new Error("Dictionary temporarily unavailable");
      const payload: unknown = await response.json();
      if (useEnglishDictionary) {
        const entry = parseOnlineEntry(word, payload);
        if (!entry) throw new Error("Invalid dictionary response");
        return entry;
      }
      const entry = parseWiktionaryEntry(candidate, baseLanguage, payload);
      if (entry) return { ...entry, word };
    }
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export function parseWiktionaryEntry(
  word: string,
  language: string,
  payload: unknown,
): DictionaryEntry | null {
  const result = object(payload);
  if (typeof result?.word !== "string" || !Array.isArray(result.entries))
    throw new Error("Invalid dictionary response");
  const meanings = new Set<string>();
  const types = new Set<string>();
  let phonetic = "";
  for (const value of result.entries) {
    const row = object(value);
    if (object(row?.language)?.code !== language || !Array.isArray(row?.senses))
      continue;
    const type = typeof row.partOfSpeech === "string" ? row.partOfSpeech : "";
    for (const value of row.senses.slice(0, 3)) {
      const definition = object(value)?.definition;
      if (typeof definition === "string" && definition.trim()) {
        meanings.add(type ? `${type}. ${definition}` : definition);
        if (type) types.add(type);
      }
    }
    if (!phonetic && Array.isArray(row.pronunciations)) {
      const sound = row.pronunciations
        .map(object)
        .find((item) => item?.type === "ipa" && typeof item.text === "string");
      if (typeof sound?.text === "string") phonetic = sound.text;
    }
  }
  if (!meanings.size) return null;
  const source = object(result.source);
  const attribution = license(source?.license);
  if (
    typeof source?.url === "string" &&
    source.url.startsWith("https://en.wiktionary.org/")
  )
    attribution.unshift({ name: "Wiktionary", url: source.url });
  return {
    word,
    lemma: word,
    meaning: [...meanings].slice(0, 6).join("\n"),
    phonetic,
    type: [...types].join(", "),
    source: "Wiktionary",
    language: "en",
    attribution,
  };
}

export function parseOnlineEntry(
  word: string,
  payload: unknown,
): DictionaryEntry | null {
  if (!Array.isArray(payload)) return null;
  const rows = payload
    .map(object)
    .filter(
      (row) =>
        row !== null &&
        typeof row.word === "string" &&
        row.word.toLowerCase() === word.toLowerCase(),
    );
  const meanings: string[] = [];
  const types = new Set<string>();
  const attribution: { name: string; url: string }[] = [];
  let phonetic = "",
    audioUrl: string | undefined;
  for (const row of rows) {
    if (!row) continue;
    attribution.push(...license(row.license));
    if (Array.isArray(row.sourceUrls))
      for (const url of row.sourceUrls)
        if (typeof url === "string" && url.startsWith("https://"))
          attribution.push({ name: "Wiktionary", url });
    if (typeof row.phonetic === "string") phonetic ||= row.phonetic;
    if (Array.isArray(row.phonetics))
      for (const value of row.phonetics) {
        const sound = object(value);
        if (typeof sound?.text === "string") phonetic ||= sound.text;
        if (
          typeof sound?.audio === "string" &&
          sound.audio.startsWith(
            "https://api.dictionaryapi.dev/media/pronunciations/en/",
          )
        ) {
          audioUrl ||= sound.audio;
          attribution.push(...license(sound.license));
          if (
            typeof sound.sourceUrl === "string" &&
            sound.sourceUrl.startsWith("https://")
          )
            attribution.push({ name: "Audio source", url: sound.sourceUrl });
        }
      }
    if (Array.isArray(row.meanings))
      for (const value of row.meanings) {
        const meaning = object(value);
        if (!meaning || !Array.isArray(meaning.definitions)) continue;
        const type =
          typeof meaning.partOfSpeech === "string" ? meaning.partOfSpeech : "";
        if (type) types.add(type);
        for (const definition of meaning.definitions.slice(0, 2)) {
          const def = object(definition);
          if (typeof def?.definition === "string" && def.definition.trim())
            meanings.push(`${type ? `${type}. ` : ""}${def.definition}`);
        }
      }
  }
  if (!meanings.length) return null;
  return {
    word,
    lemma: word,
    meaning: meanings.slice(0, 6).join("\n"),
    phonetic,
    type: [...types].join(", "),
    audioUrl,
    source: "dictionaryapi.dev",
    language: "en",
    attribution: [
      ...new Map(
        [...attribution].reverse().map((item) => [item.url, item]),
      ).values(),
    ].reverse(),
  };
}
