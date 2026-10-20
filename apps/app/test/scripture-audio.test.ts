import { expect, it } from "vitest";
import { recordingAudioItems } from "../src/domain/scripture-audio";

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
