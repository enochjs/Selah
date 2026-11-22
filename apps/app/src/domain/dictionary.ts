import { normalizeWord } from "./vocabulary";
import { isLookupWord } from "./word-tokenization";

export interface DictionaryEntry {
  word: string;
  lemma: string;
  meaning: string;
  phonetic: string;
  type: string;
  source: "Selah" | "ECDICT" | "dictionaryapi.dev" | "Wiktionary";
  language: "zh" | "en";
  audioUrl?: string;
  attribution?: { name: string; url: string }[];
}

interface LookupPorts {
  offline: (word: string) => DictionaryEntry | null;
  online: (word: string, language: string) => Promise<DictionaryEntry | null>;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<unknown>;
  };
}

interface CachedEntry {
  at: number;
  language?: string;
  entry: DictionaryEntry;
}

function matchesLookup(row: CachedEntry, word: string, language: string) {
  return row.entry.word === word && (row.language ?? "en") === language;
}

/** A separate bounded cache never changes the learner's saved library. */
export class DictionaryLookup {
  private pending = new Map<string, Promise<DictionaryEntry | null>>();
  private cacheKey = "selah-dictionary-cache-v1";
  private cacheWrite: Promise<void> = Promise.resolve();
  constructor(private readonly ports: LookupPorts) {}

  lookup(input: string, language = "en"): Promise<DictionaryEntry | null> {
    const word = normalizeWord(input).replace(/’/g, "'");
    if (!isLookupWord(word)) return Promise.resolve(null);
    const offline = language === "en" ? this.ports.offline(word) : null;
    if (offline) return Promise.resolve(offline);
    const key = `${language}:${word}`;
    const existing = this.pending.get(key);
    if (existing) return existing;
    const request = this.lookupOnline(word, language).finally(() =>
      this.pending.delete(key),
    );
    this.pending.set(key, request);
    return request;
  }

  private async lookupOnline(
    word: string,
    language: string,
  ): Promise<DictionaryEntry | null> {
    let cache: CachedEntry[] = [];
    try {
      const value: unknown = JSON.parse(
        (await this.ports.storage.getItem(this.cacheKey)) ?? "[]",
      );
      if (Array.isArray(value))
        cache = value
          .filter(isCachedEntry)
          .filter((row) => Date.now() - row.at < 30 * 86400000)
          .slice(-200);
    } catch {
      /* Corrupt or unavailable storage must not block lookup. */
    }
    const saved = cache.find((row) => matchesLookup(row, word, language));
    if (saved) return saved.entry;
    const entry = await this.ports.online(word, language);
    if (entry) {
      const write = this.cacheWrite.then(async () => {
        // Read again to preserve other words completed during the network request.
        try {
          const latest: unknown = JSON.parse(
            (await this.ports.storage.getItem(this.cacheKey)) ?? "[]",
          );
          if (Array.isArray(latest)) cache = latest.filter(isCachedEntry);
        } catch {
          /* Use the last readable cache. */
        }
        cache = cache.filter((row) => !matchesLookup(row, word, language));
        cache.push({ at: Date.now(), language, entry });
        try {
          await this.ports.storage.setItem(
            this.cacheKey,
            JSON.stringify(cache.slice(-200)),
          );
        } catch {
          /* Lookup still succeeds if the device storage is full. */
        }
      });
      this.cacheWrite = write.catch(() => {});
      await write;
    }
    return entry;
  }
}

function isCachedEntry(value: unknown): value is CachedEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.at === "number" &&
    (row.language === undefined || typeof row.language === "string") &&
    isDictionaryEntry(row.entry)
  );
}

function isDictionaryEntry(value: unknown): value is DictionaryEntry {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.word === "string" &&
    typeof row.lemma === "string" &&
    typeof row.meaning === "string" &&
    !!row.meaning.trim() &&
    typeof row.phonetic === "string" &&
    typeof row.type === "string" &&
    (row.source === "dictionaryapi.dev" || row.source === "Wiktionary") &&
    row.language === "en" &&
    (row.audioUrl === undefined ||
      (typeof row.audioUrl === "string" &&
        row.audioUrl.startsWith(
          "https://api.dictionaryapi.dev/media/pronunciations/en/",
        ))) &&
    (row.attribution === undefined ||
      (Array.isArray(row.attribution) &&
        row.attribution.every(
          (item: unknown) =>
            !!item &&
            typeof item === "object" &&
            typeof (item as Record<string, unknown>).name === "string" &&
            typeof (item as Record<string, unknown>).url === "string" &&
            (item as Record<string, string>).url.startsWith("https://"),
        )))
  );
}
