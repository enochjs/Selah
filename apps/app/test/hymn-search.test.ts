import { expect, it } from "vitest";
import { searchHymns } from "../src/domain/hymn-search";
import type { AudioTrack } from "../src/domain/models";

const hymn = (id: string, title: string, lyrics?: string): AudioTrack => ({
  id,
  title,
  lyrics,
  subtitle: "合唱团 · 现场版",
  source: 1,
  artwork: 1,
  kind: "hymn",
});

it("recognizes a lyric line without punctuation and returns the original text", () => {
  const track = hymn(
    "morning",
    "清晨",
    "[ar:作者]\n[00:02.10]因你，我心安稳\n[00:06.10]我愿与你同行",
  );
  expect(searchHymns([track], "因你我心安稳")).toEqual([
    { track, lyric: "因你，我心安稳" },
  ]);
});

it("ranks an exact title above lyric-only matches and preserves distinct recordings", () => {
  const other = hymn("hope", "盼望", "[00:01.00]奇异恩典");
  const studio = hymn("studio", "奇异恩典");
  const live = hymn("live", "奇异恩典（现场版）");
  expect(
    searchHymns([other, studio, live], "奇异恩典").map(({ track }) => track.id),
  ).toEqual(["studio", "live", "hope"]);
});

it("accepts a song title and artist in one query, even in reverse order", () => {
  const track = hymn("live", "奇异恩典");
  expect(searchHymns([track], "合唱团 奇异恩典")).toEqual([{ track }]);
});
