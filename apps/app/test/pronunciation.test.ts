import { expect, it } from "vitest";
import { WordPronunciation } from "../src/domain/word-pronunciation";

it("falls back to synthesis when dictionary audio fails and reports the actual voice type", async () => {
  const events: string[] = [];
  const speech = new WordPronunciation({
    stop: async () => {},
    playAudio: async () => {
      throw new Error("unavailable");
    },
    speak: async (word) => {
      events.push(word);
    },
  });
  await speech.play("led", "https://example.test/led.mp3", (mode) =>
    events.push(mode),
  );
  expect(events).toEqual(["recording", "synthetic", "led", "idle"]);
});
it("closing or changing the word cancels a pending recording without starting fallback speech", async () => {
  let rejectAudio: (reason: Error) => void = () => {};
  const events: string[] = [];
  const speech = new WordPronunciation({
    stop: async () => {},
    playAudio: () =>
      new Promise<void>((_, reject) => {
        rejectAudio = reject;
      }),
    speak: async () => {
      events.push("spoken");
    },
  });
  const playing = speech.play("word", "https://example.test/word.mp3", (mode) =>
    events.push(mode),
  );
  await Promise.resolve();
  await speech.stop();
  rejectAudio(new Error("stopped"));
  await playing;
  expect(events).toEqual(["recording"]);
});
it("only the most recent rapid tap may start speech", async () => {
  const words: string[] = [];
  const speech = new WordPronunciation({
    stop: async () => {},
    playAudio: async () => {},
    speak: async (word) => {
      words.push(word);
    },
  });
  await Promise.all([
    speech.play("first", undefined, () => {}),
    speech.play("second", undefined, () => {}),
  ]);
  expect(words).toEqual(["second"]);
});
it("stopping a synthetic voice is cancellation, not a playback error", async () => {
  let rejectSpeech: (reason: Error) => void = () => {};
  const speech = new WordPronunciation({
    stop: async () => {},
    playAudio: async () => {},
    speak: () =>
      new Promise<void>((_, reject) => {
        rejectSpeech = reject;
      }),
  });
  const playing = speech.play("word", undefined, () => {});
  await Promise.resolve();
  await speech.stop();
  rejectSpeech(new Error("Stopped"));
  await expect(playing).resolves.toBeUndefined();
});
