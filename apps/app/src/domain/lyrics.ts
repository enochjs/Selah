export interface LyricLine {
  text: string;
  time?: number;
}

export interface Lyrics {
  timed: boolean;
  lines: LyricLine[];
}

/** LRC offsets advance the lyric clock; plain text never receives guessed timing. */
export function parseLyrics(source: string | undefined, duration = 0): Lyrics {
  if (!source?.trim()) return { timed: false, lines: [] };
  const offset =
    Number(source.match(/\[offset:([+-]?\d+)\]/i)?.[1] ?? 0) / 1000;
  const timed: { time: number; text: string }[] = [];
  const plain: LyricLine[] = [];
  for (const row of source.split(/\r?\n/)) {
    const text = row.replace(/\[[^\]]*\]/g, "").trim();
    if (text) plain.push({ text });
    for (const stamp of row.matchAll(
      /\[(\d{1,3}):([0-5]\d)(?:[.:](\d{1,3}))?\]/g,
    )) {
      const time = Math.max(
        0,
        Number(stamp[1]) * 60 +
          Number(stamp[2]) +
          Number(`0.${stamp[3] ?? 0}`) -
          offset,
      );
      if (duration > 0 && time >= duration) continue;
      timed.push({ time, text });
    }
  }
  timed.sort((a, b) => a.time - b.time);
  const lines: LyricLine[] = [];
  for (const line of timed) {
    const previous = lines.at(-1);
    if (previous?.time === line.time) {
      if (line.text)
        previous.text = [previous.text, line.text].filter(Boolean).join("\n");
    } else lines.push({ ...line });
  }
  return lines.length ? { timed: true, lines } : { timed: false, lines: plain };
}

export function activeLyricIndex(lines: LyricLine[], position: number): number {
  if (!Number.isFinite(position)) return -1;
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const time = lines[middle].time;
    if (time !== undefined && time <= position) {
      result = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return result;
}
