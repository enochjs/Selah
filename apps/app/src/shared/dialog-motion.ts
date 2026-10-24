export interface DialogMotionDriver {
  stop: () => void;
  animate: (opening: boolean, complete: (finished: boolean) => void) => void;
}

export function dialogTiming(reducedMotion: boolean | null, opening: boolean) {
  if (opening && reducedMotion === null) return null;
  return reducedMotion !== false
    ? { backdrop: 0, panel: 0 }
    : { backdrop: opening ? 180 : 140, panel: opening ? 260 : 180 };
}

/** Interrupted transitions must never dismiss a reopened sheet. */
export class DialogMotion {
  private generation = 0;
  private opened = false;

  open(driver: DialogMotionDriver) {
    this.generation++;
    this.opened = true;
    driver.stop();
    driver.animate(true, () => {});
  }

  close(driver: DialogMotionDriver, onClosed: () => void) {
    if (!this.opened) return;
    const generation = ++this.generation;
    driver.stop();
    driver.animate(false, (finished) => {
      if (!finished || generation !== this.generation || !this.opened) return;
      this.opened = false;
      onClosed();
    });
  }

  cancel(driver: DialogMotionDriver) {
    this.generation++;
    driver.stop();
  }
}
