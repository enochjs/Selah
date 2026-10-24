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
