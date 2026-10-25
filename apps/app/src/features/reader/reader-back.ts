/** Applies only to Android system Back; chapter paging never arms this guard. */
export class ReaderBackGuard {
  private armedUntil = 0;
  private chapterKey = "";

  handle(now: number, chapterKey = "") {
    if (chapterKey !== this.chapterKey) {
      this.chapterKey = chapterKey;
      this.armedUntil = 0;
    }
    if (this.armedUntil > 0 && now <= this.armedUntil) {
      this.armedUntil = 0;
      return false;
    }
    this.armedUntil = now + 1500;
    return true;
  }
}
