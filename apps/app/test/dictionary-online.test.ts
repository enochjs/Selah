import { expect, it, vi, afterEach } from "vitest";
import { lookupOnline, parseOnlineEntry } from "../src/data/dictionary-online";
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const payload = [
  {
    word: "abundant",
    phonetic: "/əˈbʌndənt/",
    phonetics: [
      {
        audio:
          "https://api.dictionaryapi.dev/media/pronunciations/en/abundant-us.mp3",
        license: {
          name: "BY-SA 3.0",
          url: "https://creativecommons.org/licenses/by-sa/3.0",
        },
      },
    ],
    meanings: [
      {
        partOfSpeech: "adjective",
        definitions: [{ definition: "In great quantity." }],
      },
    ],
    license: {
      name: "CC BY-SA 3.0",
      url: "https://creativecommons.org/licenses/by-sa/3.0",
    },
  },
];
it("retains English fallback and audio attribution instead of claiming a Chinese definition", () => {
  expect(parseOnlineEntry("abundant", payload)).toMatchObject({
    word: "abundant",
    language: "en",
    source: "dictionaryapi.dev",
    audioUrl:
      "https://api.dictionaryapi.dev/media/pronunciations/en/abundant-us.mp3",
    attribution: [
      {
        name: "CC BY-SA 3.0",
        url: "https://creativecommons.org/licenses/by-sa/3.0",
      },
    ],
  });
});
it("rejects unrelated words, malformed data and untrusted audio URLs", () => {
  expect(parseOnlineEntry("different", payload)).toBeNull();
  expect(parseOnlineEntry("abundant", {})).toBeNull();
  const invalid = [
    { ...payload[0], phonetics: [{ audio: "http://127.0.0.1/private.mp3" }] },
  ];
  expect(parseOnlineEntry("abundant", invalid)?.audioUrl).toBeUndefined();
});
it("distinguishes a missing word from a service failure", async () => {
  vi.stubGlobal("fetch", async () => ({ status: 404 }));
  expect(await lookupOnline("absent")).toBeNull();
  vi.stubGlobal("fetch", async () => ({ status: 503, ok: false }));
  await expect(lookupOnline("absent")).rejects.toThrow(
    "temporarily unavailable",
  );
});
it("requests the selected language and retains only matching Wiktionary definitions and attribution", async () => {
  const fetcher = vi.fn(async () => ({
    status: 200,
    ok: true,
    json: async () => ({
      word: "foi",
      entries: [
        {
          language: { code: "fr" },
          partOfSpeech: "noun",
          senses: [{ definition: "Faith." }],
        },
        {
          language: { code: "pt" },
          partOfSpeech: "verb",
          senses: [{ definition: "Went." }],
        },
      ],
      source: {
        url: "https://en.wiktionary.org/wiki/foi",
        license: {
          name: "CC BY-SA 4.0",
          url: "https://creativecommons.org/licenses/by-sa/4.0/",
        },
      },
    }),
  }));
  vi.stubGlobal("fetch", fetcher);
  expect(await lookupOnline("foi", "fr")).toMatchObject({
    word: "foi",
    meaning: "noun. Faith.",
    language: "en",
    source: "Wiktionary",
    attribution: [{ name: "Wiktionary" }, { name: "CC BY-SA 4.0" }],
  });
  expect(fetcher).toHaveBeenCalledWith(
    "https://freedictionaryapi.com/api/v1/entries/fr/foi",
    expect.objectContaining({ credentials: "omit" }),
  );
});
it("bounds a stalled network lookup so the reader can retry", async () => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "fetch",
    (_url: string, options: RequestInit) =>
      new Promise((_, reject) => {
        options.signal?.addEventListener("abort", () =>
          reject(new Error("aborted")),
        );
      }),
  );
  const result = expect(lookupOnline("absent")).rejects.toThrow("aborted");
  await vi.advanceTimersByTimeAsync(6000);
  await result;
});

it("finds a Chinese headword under its traditional spelling and keeps the selected simplified spelling", async () => {
  const fetcher = vi.fn(async (url: string) => ({
    status: 200,
    ok: true,
    json: async () => ({
      word: "創造",
      entries: url.endsWith(encodeURIComponent("創造"))
        ? [{ language: { code: "zh" }, senses: [{ definition: "to create" }] }]
        : [],
    }),
  }));
  vi.stubGlobal("fetch", fetcher);
  expect(await lookupOnline("创造", "zh")).toMatchObject({
    word: "创造",
    lemma: "創造",
    meaning: "to create",
  });
});

it("does not send a dictionary query when an installed build requires an online compatibility update", async () => {
  const { bindUpdateCompatibility } =
    await import("../src/data/update-compatibility");
  const dispose = bindUpdateCompatibility({
    getSnapshot: () => ({
      installed: { buildNumber: 1 },
      release: { buildNumber: 3, minSupportedBuild: 2 },
    }),
    subscribe: () => () => {},
    initialize: async () => {},
  });
  const request = vi.fn();
  vi.stubGlobal("fetch", request);
  try {
    await expect(lookupOnline("abundant")).rejects.toMatchObject({
      code: "update-required",
    });
    expect(request).not.toHaveBeenCalled();
  } finally {
    dispose();
  }
});
