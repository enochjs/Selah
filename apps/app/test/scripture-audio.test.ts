import { expect, it } from "vitest";
import {
  matchesVerseAudio,
  recordingAudioItems,
} from "../src/domain/scripture-audio";
import type { AudioTrack } from "../src/domain/models";

const verseTrack: AudioTrack = {
  id: "numbers-1-23-zh",
  title: "民数记 1:22–23",
  subtitle: "",
  kind: "scripture",
  source: { uri: "https://example.test/verse.mp3" },
  artwork: 1,
  bookId: "numbers",
  chapter: 1,
  verse: 23,
  coveredVerses: [22, 23],
  locale: "zh",
};
const target = {
  bookId: "numbers",
  chapter: 1,
  verse: 23,
  locale: "zh" as const,
};

it("recognizes the selected verse recording so its button can pause or resume it", () => {
  expect(matchesVerseAudio(verseTrack, target)).toBe(true);
  expect(matchesVerseAudio(verseTrack, { ...target, verse: 22 })).toBe(true);
});
it("does not toggle a different verse, chapter, language, or hymn", () => {
  expect(matchesVerseAudio(verseTrack, { ...target, verse: 24 })).toBe(false);
  expect(matchesVerseAudio(verseTrack, { ...target, chapter: 2 })).toBe(false);
  expect(matchesVerseAudio(verseTrack, { ...target, locale: "en" })).toBe(
    false,
  );
  expect(matchesVerseAudio({ ...verseTrack, kind: "hymn" }, target)).toBe(
    false,
  );
});
it("does not mistake an unaligned whole chapter or empty player for a verse", () => {
  expect(matchesVerseAudio(null, target)).toBe(false);
  expect(
    matchesVerseAudio(
      { ...verseTrack, verse: undefined, coveredVerses: undefined },
      target,
    ),
  ).toBe(false);
});

it("plays each Chinese verse from its own MP3 without estimated seek offsets", () => {
  const items = recordingAudioItems({
    path: "/first.mp3",
    duration: 12,
    segments: [],
    verseFiles: [
      { verse: 1, path: "/first.mp3", duration: 4 },
      { verse: 3, path: "/third.mp3", duration: 8 },
    ],
  });
  expect(items).toEqual([
    { verse: 1, path: "/first.mp3", duration: 4 },
    { verse: 3, path: "/third.mp3", duration: 8 },
  ]);
});

it("preserves a provider's chapter time base and canonical verse IDs", () => {
  expect(
    recordingAudioItems({
      path: "/chapter.mp3",
      duration: 20,
      segments: [
        [1, 2, 5],
        [3, 5, 20],
      ],
    }),
  ).toEqual([
    { verse: 1, path: "/chapter.mp3", startTime: 2, endTime: 5, duration: 3 },
    { verse: 3, path: "/chapter.mp3", startTime: 5, endTime: 20, duration: 15 },
  ]);
});

it("keeps unverified chapter audio out of a verse playback queue", () => {
  expect(
    recordingAudioItems({ path: "/chapter.mp3", duration: 20, segments: [] }),
  ).toEqual([]);
});
it("preserves explicitly merged verse coverage for the narration label", () => {
  expect(
    recordingAudioItems({
      path: "/chapter.mp3",
      duration: 8,
      segments: [],
      verseFiles: [
        {
          verse: 23,
          path: "/verse23.mp3",
          duration: 8,
          coveredVerses: [22, 23],
        },
      ],
    })[0].coveredVerses,
  ).toEqual([22, 23]);
});
it("retains original chapter offsets alongside isolated files for continuous listening", () => {
  const items = recordingAudioItems({
    path: "/chapter.mp3",
    duration: 65.844,
    segments: [],
    verseFiles: [
      {
        verse: 4,
        path: "/verse4.mp3",
        duration: 12.058,
        sourceStart: 24.781,
        sourceEnd: 36.839,
      },
    ],
  });
  expect(items[0]).toMatchObject({
    verse: 4,
    path: "/verse4.mp3",
    chapterRange: { startTime: 24.781, endTime: 36.839 },
  });
});
