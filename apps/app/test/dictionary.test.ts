import { describe, expect, it, vi } from "vitest";
import { lookupOffline } from "../src/data/dictionary";
import {
  DictionaryLookup,
  type DictionaryEntry,
} from "../src/domain/dictionary";

describe("offline word lookup", () => {
  it.each(["abundant", "firmament", "covenant", "the", "pharisee", "abraham"])(
    "provides a Chinese definition for %s without asking the learner",
    (word) => expect(lookupOffline(word)?.meaning).toMatch(/[\u3400-\u9fff]/),
  );
  it.each([
    ["led", "lead"],
    ["children", "child"],
    ["walking", "walk"],
    ["cities", "city"],
  ])("resolves %s to %s while keeping the selected spelling", (word, lemma) =>
    expect(lookupOffline(word)).toMatchObject({ word, lemma }),
  );
  it("preserves curated Bible definitions and handles punctuation and possessives", () => {
    expect(lookupOffline(" ‘SHEPHERD,’ ")?.meaning).toBe("牧人；牧羊人");
    expect(lookupOffline("shepherd’s")?.lemma).toBe("shepherd");
    expect(lookupOffline("zzzzunknownword")).toBeNull();
    expect(lookupOffline("constructor")).not.toBeNull();
    expect(lookupOffline("__proto__")).toBeNull();
  });
  it("provides the Thai classifier's Chinese definition and phonetic offline", () => {
    expect(lookupOffline("แห่ง", "th")).toMatchObject({
      meaning: "名词：地方\n量词：用于地方、地点。\n介词：的",
      language: "zh",
      type: "名词、量词、介词",
      phonetic: "/hɛŋ˨˩/",
    });
  });
  it.each([
    ["พระ", "敬"],
    ["ของ", "的"],
    ["เลี้ยง", "喂养"],
    ["แกะ", "羊"],
    ["พยากรณ์", "预言"],
    ["ทรง", "敬意"],
  ])("provides a Chinese definition for %s in the reader", (word, gloss) => {
    expect(lookupOffline(word, "th")).toMatchObject({
      language: "zh",
      meaning: expect.stringContaining(gloss),
    });
  });
});

const entry: DictionaryEntry = {
  word: "unknown",
  lemma: "unknown",
  meaning: "A definition",
  phonetic: "",
  type: "noun",
  source: "dictionaryapi.dev",
  language: "en",
};
function fixture() {
  const saved = new Map<string, string>();
  let calls = 0;
  const lookup = new DictionaryLookup({
    offline: () => null,
    storage: {
      getItem: async (key) => saved.get(key) ?? null,
      setItem: async (key, value) => {
        saved.set(key, value);
      },
    },
    online: async (word) => {
      calls++;
      return word === "unknown" ? entry : null;
    },
  });
  return { lookup, saved, calls: () => calls };
}
describe("online fallback", () => {
  it("uses Thai Chinese definitions offline and queries English for English primary reading", async () => {
    const online = vi.fn(async () => ({
      ...entry,
      word: "แห่ง",
      lemma: "แห่ง",
      meaning: "place",
    }));
    const lookup = new DictionaryLookup({
      offline: lookupOffline,
      online,
      storage: {
        getItem: async () => null,
        setItem: async () => {},
      },
    });
    expect((await lookup.lookup("แห่ง", "th", "zh"))?.meaning).toContain(
      "地方",
    );
    expect(online).not.toHaveBeenCalled();
    expect((await lookup.lookup("แห่ง", "th", "en"))?.meaning).toBe("place");
    expect(online).toHaveBeenCalledOnce();
  });
  it("keeps definitions in different languages separate across app restarts", async () => {
    const cache = new Map<string, string>();
    const ports = {
      offline: () => null,
      online: vi.fn(
        async (word: string, _language: string, locale?: "en" | "zh") => ({
          ...entry,
          word,
          lemma: word,
          language: locale ?? "en",
          meaning: locale === "zh" ? "地方" : "place",
        }),
      ),
      storage: {
        getItem: async (key: string) => cache.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          cache.set(key, value);
        },
      },
    };
    const lookup = new DictionaryLookup(ports);
    expect((await lookup.lookup("แห่ง", "th", "en"))?.meaning).toBe("place");
    expect((await lookup.lookup("แห่ง", "th", "zh"))?.meaning).toBe("地方");
    expect(
      (await new DictionaryLookup(ports).lookup("แห่ง", "th", "zh"))?.meaning,
    ).toBe("地方");
    expect(ports.online).toHaveBeenCalledTimes(2);
  });
  it("looks up Unicode headwords and keeps identical spellings in different languages separate", async () => {
    const storage = new Map<string, string>();
    const calls: string[] = [];
    const ports = {
      offline: (_word: string, language: string) =>
        language === "en" ? entry : null,
      storage: {
        getItem: async (key: string) => storage.get(key) ?? null,
        setItem: async (key: string, value: string) => {
          storage.set(key, value);
        },
      },
      online: async (
        word: string,
        language: string,
      ): Promise<DictionaryEntry> => {
        calls.push(`${language}:${word}`);
        return {
          ...entry,
          word,
          lemma: word,
          meaning: language,
          source: "Wiktionary",
        };
      },
    };
    const lookup = new DictionaryLookup(ports);
    const results = await Promise.all([
      lookup.lookup("创造", "zh"),
      lookup.lookup("Foi", "fr"),
      lookup.lookup("Foi", "pt"),
    ]);
    expect(results.map((row) => row?.meaning)).toEqual(["zh", "fr", "pt"]);
    expect(
      (await new DictionaryLookup(ports).lookup("FOI", "fr"))?.meaning,
    ).toBe("fr");
    expect(calls).toEqual(["zh:创造", "fr:foi", "pt:foi"]);
  });
  it("caches successful lookups across restarts and coalesces concurrent requests", async () => {
    const f = fixture();
    expect(
      await Promise.all([
        f.lookup.lookup("unknown"),
        f.lookup.lookup("unknown"),
      ]),
    ).toEqual([entry, entry]);
    expect(f.calls()).toBe(1);
    const restarted = new DictionaryLookup({
      offline: () => null,
      storage: {
        getItem: async (key) => f.saved.get(key) ?? null,
        setItem: async () => {},
      },
      online: async () => {
        throw new Error("offline");
      },
    });
    expect(await restarted.lookup("unknown")).toEqual(entry);
  });
  it("does not send offline words to an external service", async () => {
    const lookup = new DictionaryLookup({
      offline: () => entry,
      storage: {
        getItem: async () => {
          throw new Error("unavailable");
        },
        setItem: async () => {},
      },
      online: async () => {
        throw new Error("must not query");
      },
    });
    expect(await lookup.lookup("unknown")).toEqual(entry);
  });
  it("recovers from corrupt cache and storage failures", async () => {
    const lookup = new DictionaryLookup({
      offline: () => null,
      storage: {
        getItem: async () => "{broken",
        setItem: async () => {
          throw new Error("full");
        },
      },
      online: async () => entry,
    });
    expect(await lookup.lookup("unknown")).toEqual(entry);
  });
  it("does not cache failures or missing words, so retry can recover", async () => {
    const f = fixture();
    expect(await f.lookup.lookup("missing")).toBeNull();
    expect(await f.lookup.lookup("missing")).toBeNull();
    expect(f.calls()).toBe(2);
  });
  it("preserves both words when different online requests finish together", async () => {
    const saved = new Map<string, string>();
    const lookup = new DictionaryLookup({
      offline: () => null,
      storage: {
        getItem: async (key) => saved.get(key) ?? null,
        setItem: async (key, value) => {
          await Promise.resolve();
          saved.set(key, value);
        },
      },
      online: async (word) => ({ ...entry, word, lemma: word }),
    });
    await Promise.all([lookup.lookup("first"), lookup.lookup("second")]);
    expect(JSON.parse([...saved.values()][0])).toHaveLength(2);
  });
});
