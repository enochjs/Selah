import type { DictionaryEntry } from "../domain/dictionary";

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
): Promise<DictionaryEntry | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(
      `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`,
      {
        signal: controller.signal,
        credentials: "omit",
      },
    );
    if (response.status === 404) return null;
    if (!response.ok) throw new Error("Dictionary temporarily unavailable");
    const entry = parseOnlineEntry(word, await response.json());
    if (!entry) throw new Error("Invalid dictionary response");
    return entry;
  } finally {
    clearTimeout(timeout);
  }
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
