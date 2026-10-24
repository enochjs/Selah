import { normalizeWord } from "./vocabulary";

export interface DictionaryEntry {
  word: string;
  lemma: string;
  meaning: string;
  phonetic: string;
  type: string;
  source: "Selah" | "ECDICT" | "dictionaryapi.dev";
  language: "zh" | "en";
  audioUrl?: string;
  attribution?: { name: string; url: string }[];
}

interface LookupPorts {
  offline: (word: string) => DictionaryEntry | null;
  online: (word: string) => Promise<DictionaryEntry | null>;
  storage: {
    getItem: (key: string) => Promise<string | null>;
    setItem: (key: string, value: string) => Promise<unknown>;
  };
}

/** A separate bounded cache never changes the learner's saved library. */
export class DictionaryLookup {
  private pending = new Map<string, Promise<DictionaryEntry | null>>();
  private cacheKey = "selah-dictionary-cache-v1";
  private cacheWrite: Promise<void> = Promise.resolve();
  constructor(private readonly ports: LookupPorts) {}

  lookup(input: string): Promise<DictionaryEntry | null> {
    const word = normalizeWord(input).replace(/’/g, "'");
    if (!word || !/^[a-z]+(?:['’\-][a-z]+)*$/.test(word))
      return Promise.resolve(null);
    const offline = this.ports.offline(word);
    if (offline) return Promise.resolve(offline);
    const existing = this.pending.get(word);
    if (existing) return existing;
    const request = this.lookupOnline(word).finally(() =>
      this.pending.delete(word),
    );
    this.pending.set(word, request);
    return request;
  }

  private async lookupOnline(word: string): Promise<DictionaryEntry | null> {
    let cache: { at: number; entry: DictionaryEntry }[] = [];
    try {
      const value: unknown = JSON.parse(
        (await this.ports.storage.getItem(this.cacheKey)) ?? "[]",
      );
      if (Array.isArray(value))
        cache = value
          .filter(
            (row): row is { at: number; entry: DictionaryEntry } =>
              !!row &&
              typeof row === "object" &&
              typeof row.at === "number" &&
              Date.now() - row.at < 30 * 86400000 &&
              isDictionaryEntry(row.entry),
          )
          .slice(-200);
    } catch {
      /* Corrupt or unavailable storage must not block lookup. */
    }
    const saved = cache.find((row) => row.entry.word === word);
    if (saved) return saved.entry;
    const entry = await this.ports.online(word);
    if (entry) {
      const write = this.cacheWrite.then(async () => {
        // Read again to preserve other words completed during the network request.
        try {
          const latest: unknown = JSON.parse(
            (await this.ports.storage.getItem(this.cacheKey)) ?? "[]",
          );
          if (Array.isArray(latest))
            cache = latest.filter(
              (row): row is { at: number; entry: DictionaryEntry } =>
                !!row &&
                typeof row === "object" &&
                typeof row.at === "number" &&
                isDictionaryEntry(row.entry),
            );
        } catch {
          /* Use the last readable cache. */
        }
        cache = cache.filter((row) => row.entry.word !== word);
        cache.push({ at: Date.now(), entry });
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
    row.source === "dictionaryapi.dev" &&
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
