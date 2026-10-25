export const chapterPreloadRadius = 3;

export interface ChapterBuffer {
  first: number;
  last: number;
}

export function chapterBuffer(
  total: number,
  first: number,
  last = first,
): ChapterBuffer {
  return {
    first: Math.max(0, first - chapterPreloadRadius),
    last: Math.min(total - 1, last + chapterPreloadRadius),
  };
}

/** Grow text ahead of the gesture; native chapter positions stay unchanged. */
export function growChapterBuffer(
  current: ChapterBuffer,
  total: number,
  position: number,
  offset: number,
): ChapterBuffer {
  const next = chapterBuffer(total, position, Math.ceil(position + offset));
  if (next.first >= current.first && next.last <= current.last) return current;
  if (next.first > current.last || next.last < current.first) return next;
  return {
    first: Math.min(current.first, next.first),
    last: Math.max(current.last, next.last),
  };
}
