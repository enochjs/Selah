export interface ChapterFrame {
  x: number;
  opacity: number;
}

export interface ChapterMotionDriver {
  stop: () => void;
  set: (frame: ChapterFrame) => void;
  animate: (
    frame: ChapterFrame,
    duration: number,
    complete: (finished: boolean) => void,
  ) => void;
}

const resting: ChapterFrame = { x: 0, opacity: 1 };

/** Lives above the keyed chapter so a remount cannot cut off its transition. */
export class ChapterMotion {
  private generation = 0;
  private phase:
    "idle" | "dragging" | "exiting" | "waiting" | "entering" | "settling" =
    "idle";
  private dragX = 0;
  private pendingKey: string | null = null;

  constructor(
    private shownKey: string,
    private driver: ChapterMotionDriver,
    private onBusyChange: (busy: boolean) => void = () => {},
  ) {}

  get busy() {
    return this.phase !== "idle" && this.phase !== "dragging";
  }

  private setPhase(phase: typeof this.phase) {
    const wasBusy = this.busy;
    this.phase = phase;
    if (wasBusy !== this.busy) this.onBusyChange(this.busy);
  }

  drag(dx: number, width: number, previous: boolean, next: boolean) {
    if (this.busy) return;
    this.setPhase("dragging");
    const available = dx > 0 ? previous : next;
    this.dragX =
      Math.sign(dx) *
      Math.min(Math.abs(dx) * (available ? 0.65 : 0.12), width * 0.35);
    this.driver.set({ x: this.dragX, opacity: 1 });
  }

  turn(
    key: string,
    direction: -1 | 1,
    width: number,
    reducedMotion: boolean | null,
    navigate: () => void,
  ) {
    if (this.busy || key === this.shownKey) return;
    if (reducedMotion !== false) {
      this.cancel();
      navigate();
      return;
    }
    const generation = ++this.generation;
    const distance = Math.min(72, width * 0.14);
    this.pendingKey = key;
    this.setPhase("exiting");
    this.driver.stop();
    this.driver.animate(
      { x: -direction * Math.max(distance, Math.abs(this.dragX)), opacity: 0 },
      110,
      (finished) => {
        if (generation !== this.generation) return;
        if (!finished) {
          this.cancel();
          return;
        }
        this.setPhase("waiting");
        this.driver.set({ x: direction * distance, opacity: 0 });
        navigate();
      },
    );
  }

  /** Called after React commits the new chapter, with its own reading viewport. */
  show(key: string) {
    if (key === this.shownKey) return;
    this.shownKey = key;
    if (key !== this.pendingKey || this.phase !== "waiting") {
      this.cancel();
      return;
    }
    const generation = this.generation;
    this.setPhase("entering");
    this.driver.animate(resting, 210, () => {
      if (generation === this.generation) this.cancel();
    });
  }

  settle(reducedMotion: boolean | null) {
    if (this.phase !== "dragging") return;
    if (reducedMotion !== false) {
      this.cancel();
      return;
    }
    const generation = ++this.generation;
    this.setPhase("settling");
    this.driver.stop();
    this.driver.animate(resting, 180, () => {
      if (generation === this.generation) this.cancel();
    });
  }

  cancel() {
    this.generation++;
    this.pendingKey = null;
    this.dragX = 0;
    this.driver.stop();
    this.driver.set(resting);
    this.setPhase("idle");
  }
}
