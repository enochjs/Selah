import {
  visibleReadingPosition,
  type ReadingPosition,
  type VerseLayout,
} from "../../domain/reading";

/** Collects asynchronous layout measurements without depending on their arrival order. */
export class ReadingViewport {
  private rows = new Map<number, VerseLayout>();
  private viewportHeight = 0;
  private contentHeight = 0;
  private scrollY = 0;
  private ready = false;
  private anchored = false;
  private pending: ReadingPosition | null;
  restoredTarget: ReadingPosition | null = null;

  constructor(
    private readonly initial: ReadingPosition,
    private topInset = 0,
  ) {
    this.pending = initial;
  }

  layoutVerse(row: VerseLayout) {
    const previous = this.rows.get(row.verse);
    this.rows.set(row.verse, row);
    if (
      this.anchored &&
      row.verse === this.restoredTarget?.verse &&
      previous?.y !== row.y
    )
      this.pending = this.restoredTarget;
    return this.restore();
  }

  /** Capture the old semantic anchor before the new layout measurements arrive. */
  setTopInset(topInset: number) {
    if (topInset !== this.topInset) {
      const position = this.position();
      this.topInset = topInset;
      if (position) this.pending = position;
      return this.restore();
    }
    return null;
  }

  layoutViewport(height: number) {
    this.viewportHeight = height;
    return this.restore();
  }

  layoutContent(height: number) {
    this.contentHeight = height;
    return this.restore();
  }

  request(target: ReadingPosition) {
    this.pending = target;
    this.ready = false;
    return this.restore();
  }

  preservePosition() {
    const position = this.position();
    return position ? this.request(position) : null;
  }

  scrolled(y: number) {
    if (this.ready) {
      if (Math.abs(y - this.scrollY) > 1) this.anchored = false;
      this.scrollY = y;
    }
  }

  verseY(verse: number) {
    return this.rows.get(verse)?.y;
  }

  /** Plain paragraphs retain full layout; only nearby words need gesture nodes. */
  wordWindow(): { first: number; last: number } {
    const target = this.pending ?? this.restoredTarget ?? this.initial;
    if (!this.ready || !this.viewportHeight)
      return { first: Math.max(1, target.verse - 4), last: target.verse + 8 };
    const top = this.scrollY - this.viewportHeight;
    const bottom = this.scrollY + this.viewportHeight * 2;
    let first = Infinity;
    let last = 0;
    for (const row of this.rows.values()) {
      if (row.y + row.height > top && row.y < bottom) {
        first = Math.min(first, row.verse);
        last = Math.max(last, row.verse);
      }
    }
    return last ? { first, last } : { first: target.verse, last: target.verse };
  }

  position() {
    return this.ready
      ? visibleReadingPosition(
          this.initial.bookId,
          this.initial.chapter,
          [...this.rows.values()].sort((a, b) => a.verse - b.verse),
          this.scrollY + this.topInset,
        )
      : null;
  }

  private restore(): number | null {
    const target = this.pending;
    if (!target || !this.contentHeight || !this.viewportHeight) return null;
    const row = this.rows.get(target.verse);
    if (!row) return null;
    const desiredY =
      target.verse === 1 && target.offset === 0
        ? 0
        : row.y + target.offset - this.topInset;
    this.scrollY = Math.max(
      0,
      Math.min(desiredY, this.contentHeight - this.viewportHeight),
    );
    this.pending = null;
    this.restoredTarget = target;
    this.ready = true;
    this.anchored = true;
    return this.scrollY;
  }
}
