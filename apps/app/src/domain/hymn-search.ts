import { parseLyrics } from "./lyrics";
import type { AudioTrack } from "./models";

function normalize(text: string) {
  return text.normalize("NFKC").toLowerCase().trim();
}

function compact(text: string) {
  return normalize(text).replace(/[^\p{L}\p{N}\p{M}]/gu, "");
}

export function indexHymns(tracks: readonly AudioTrack[]) {
  return tracks.map((track) => ({
    track,
    titles: [track.title, track.hymn?.titleZh, track.hymn?.titleEn]
      .filter((title): title is string => !!title)
      .map(compact),
    details: [
      track.hymn?.artist,
      track.subtitle,
      track.hymn?.subtitleZh,
      track.hymn?.subtitleEn,
    ]
      .filter((detail): detail is string => !!detail)
      .map(compact),
    lyrics: parseLyrics(track.lyrics)
      .lines.flatMap(({ text }) => text.split("\n"))
      .filter(Boolean)
      .map((text) => ({ text, key: compact(text) })),
  }));
}

export function searchHymns(
  tracks: readonly AudioTrack[],
  query: string,
  index = indexHymns(tracks),
): { track: AudioTrack; lyric?: string }[] {
  const needle = compact(query);
  if (!needle) return [];
  const tokens = normalize(query).split(/\s+/).map(compact).filter(Boolean);
  return index
    .flatMap(({ track, titles, details, lyrics }) => {
      if (titles.includes(needle)) return [{ result: { track }, rank: 0 }];
      if (titles.some((title) => title.includes(needle)))
        return [{ result: { track }, rank: 1 }];
      if (
        details.some((detail) => detail.includes(needle)) ||
        tokens.every((token) =>
          [...titles, ...details].some((field) => field.includes(token)),
        )
      )
        return [{ result: { track }, rank: 2 }];
      // A single character makes good title suggestions but weak lyric matches.
      if ([...needle].length < 2) return [];
      const direct = lyrics.find(({ key }) => key.includes(needle));
      if (direct) return [{ result: { track, lyric: direct.text }, rank: 3 }];
      const first = lyrics.findIndex(({ key }, i) =>
        (key + (lyrics[i + 1]?.key ?? "")).includes(needle),
      );
      if (first === -1) return [];
      const lyric = `${lyrics[first].text} / ${lyrics[first + 1].text}`;
      return [{ result: { track, lyric }, rank: 3 }];
    })
    .sort((a, b) => a.rank - b.rank)
    .map(({ result }) => result);
}
