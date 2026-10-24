import { describe, expect, it } from "vitest";
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
