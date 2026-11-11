import { expect, it } from "vitest";
import { offlineHymn } from "../src/data/hymn-downloads";

const hymn = {
  id: "new-song",
  titleZh: "新歌",
  titleEn: "New song",
  subtitleZh: "演唱者",
  subtitleEn: "Artist",
  duration: 20,
  audioPath: `/api/audio/hymns/${"a".repeat(64)}.mp3`,
  enabled: true,
  reviewStatus: "approved",
  lyrics: "[00:01]歌词",
};
it("builds an offline song from a published snapshot and the real server file size", () => {
  expect(offlineHymn(hymn, "1234")).toEqual({
    kind: "hymn",
    key: "hymn:new-song",
    hymn,
    files: [{ path: hymn.audioPath, sha256: "a".repeat(64), size: 1234 }],
  });
});
it.each([null, "", "0", "-1", "1.2", "NaN", "99999999999999999"])(
  "rejects an unavailable or invalid size %s",
  (size) => {
    expect(() => offlineHymn(hymn, size)).toThrow("unavailable");
  },
);
it.each([
  { ...hymn, enabled: false },
  { ...hymn, reviewStatus: "pending" },
  { ...hymn, audioPath: "https://other.test/audio.mp3" },
])("rejects unpublished songs and unsafe paths", (item) => {
  expect(() => offlineHymn(item, "1234")).toThrow();
});
