import { expect, it } from "vitest";
import {
  matchesVerseAudio,
  recordingAudioItems,
  isVerseMissing,
  missingVerseFragments,
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

it("leaves legacy cuts without original offsets unavailable for verse playback", () => {
  const items = recordingAudioItems({
    path: "/first.mp3",
    duration: 12,
    segments: [],
    verseFiles: [
      { verse: 1, path: "/first.mp3", duration: 4 },
      { verse: 3, path: "/third.mp3", duration: 8 },
    ],
  });
  expect(items).toEqual([]);
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
          sourceStart: 0,
          sourceEnd: 8,
          coveredVerses: [22, 23],
        },
      ],
    })[0].coveredVerses,
  ).toEqual([22, 23]);
});
it("uses original chapter offsets for continuous listening and repetition", () => {
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
    path: "/chapter.mp3",
    startTime: 24.781,
    endTime: 36.839,
    chapterRange: { startTime: 24.781, endTime: 36.839 },
  });
});

const partialRecording = {
  alignmentStatus: "partial" as const,
  path: "/chapter.mp3",
  duration: 20,
  segments: [
    [1, 1, 8],
    [2, 8, 10],
    [3, 10, 20],
  ] as [number, number, number][],
  missingVerses: [{ verse: 2, reason: "not-narrated-in-source" as const }],
  verseFiles: [
    {
      verse: 1,
      path: "/verse1.mp3",
      duration: 7,
      sourceStart: 1,
      sourceEnd: 8,
    },
    {
      verse: 3,
      path: "/verse3.mp3",
      duration: 10,
      sourceStart: 10,
      sourceEnd: 20,
    },
  ],
};
it("keeps verified partial chapter files playable without inventing missing verse tracks", () => {
  expect(
    recordingAudioItems(partialRecording).map((item) => item.verse),
  ).toEqual([1, 3]);
  expect(isVerseMissing(partialRecording, 2)).toBe(true);
  expect(isVerseMissing(partialRecording, 1)).toBe(false);
  expect(
    isVerseMissing({ ...partialRecording, missingVerses: undefined }, 2),
  ).toBe(false);
});
it("keeps a partly narrated verse playable and exposes exactly its missing text", () => {
  const recording = {
    ...partialRecording,
    missingVerses: [],
    missingFragments: [
      {
        verse: 1,
        text: "Then they all went home",
        reason: "not-narrated-in-source" as const,
      },
    ],
  };
  expect(isVerseMissing(recording, 1)).toBe(false);
  expect(recordingAudioItems(recording).map((item) => item.verse)).toContain(1);
  expect(missingVerseFragments(recording, 1)).toEqual([
    "Then they all went home",
  ]);
  expect(missingVerseFragments(recording, 3)).toEqual([]);
});
it("never falls back to timing or merged aliases for explicitly missing narration", () => {
  expect(
    recordingAudioItems({ ...partialRecording, verseFiles: undefined }).map(
      (item) => item.verse,
    ),
  ).toEqual([1, 3]);
  const items = recordingAudioItems({
    ...partialRecording,
    verseFiles: [
      { ...partialRecording.verseFiles[0], coveredVerses: [1, 2] },
      ...partialRecording.verseFiles.slice(1),
    ],
  });
  expect(items[0].coveredVerses).toEqual([1]);
});
