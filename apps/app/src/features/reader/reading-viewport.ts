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
  private pendingViewportY: number | null = null;
  private ready = false;
  private anchored = false;
  private pending: ReadingPosition | null;
  restoredTarget: ReadingPosition | null = null;

  constructor(private readonly initial: ReadingPosition) {
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

  layoutViewport(height: number) {
    this.viewportHeight = height;
    if (this.pendingViewportY !== null) {
      this.scrollY = Math.max(
        0,
        Math.min(this.pendingViewportY, this.contentHeight - height),
      );
      this.pendingViewportY = null;
      this.anchored = false;
      return this.scrollY;
    }
    return this.restore();
  }

  /** Compensate for a toolbar changing the viewport's screen origin. */
  prepareForViewportShift(topChange: number) {
    if (!this.ready) return;
    this.pendingViewportY = (this.pendingViewportY ?? this.scrollY) + topChange;
    if (this.pendingViewportY === this.scrollY) this.pendingViewportY = null;
  }

  layoutContent(height: number) {
    this.contentHeight = height;
    return this.restore();
  }

  request(target: ReadingPosition) {
    this.pendingViewportY = null;
    this.pending = target;
    this.ready = false;
    return this.restore();
  }

  preservePosition() {
    const position = this.position();
    return position ? this.request(position) : null;
  }

  scrolled(y: number) {
    if (this.pendingViewportY !== null) return;
    if (this.ready) {
      if (Math.abs(y - this.scrollY) > 1) this.anchored = false;
      this.scrollY = y;
    }
  }

  verseY(verse: number) {
    return this.rows.get(verse)?.y;
  }

  position() {
    return this.ready
      ? visibleReadingPosition(
          this.initial.bookId,
          this.initial.chapter,
          [...this.rows.values()].sort((a, b) => a.verse - b.verse),
          this.scrollY,
        )
      : null;
  }

  private restore(): number | null {
    const target = this.pending;
    if (!target || !this.contentHeight || !this.viewportHeight) return null;
    const row = this.rows.get(target.verse);
    if (!row) return null;
    const desiredY =
      target.verse === 1 && target.offset === 0 ? 0 : row.y + target.offset;
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
