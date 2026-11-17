import {
  UpdateFailure,
  type UpdatePorts,
  type UpdateSnapshot,
  type UpdatePreferences,
} from "./app-updates";
import {
  emptyUpdatePreferences,
  parseAppRelease,
  parseUpdatePreferences,
  shouldRemindUpdate,
} from "./app-release";

function failure(error: unknown) {
  return error instanceof UpdateFailure ? error.code : ("network" as const);
}
export class AppUpdateManager {
  private state: UpdateSnapshot;
  private preferences = emptyUpdatePreferences();
  private readonly listeners = new Set<() => void>();
  private initialization: Promise<void> | null = null;
  private checking: Promise<void> | null = null;
  private transfer: AbortController | null = null;
  private writes: Promise<void> = Promise.resolve();
  constructor(private readonly ports: UpdatePorts) {
    this.state = {
      initialized: false,
      installed: ports.artifact.installed(),
      phase: "idle",
      release: null,
      bytes: 0,
      error: null,
      checking: false,
      checkFailed: false,
    };
  }
  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(change: Partial<UpdateSnapshot>) {
    this.state = { ...this.state, ...change };
    this.listeners.forEach((listener) => listener());
  }
  private persist(change: Partial<UpdatePreferences>) {
    this.preferences = { ...this.preferences, ...change };
    const snapshot = { ...this.preferences };
    const task = this.writes.then(() => this.ports.save(snapshot));
    this.writes = task.catch(() => {});
    return task;
  }
  initialize(): Promise<void> {
    this.initialization ??= this.restore();
    return this.initialization;
  }
  private async restore() {
    try {
      this.preferences = parseUpdatePreferences(
        await this.ports.load(),
        this.state.installed,
      );
      const release = this.preferences.release;
      if (release) {
        // Compatibility is metadata policy and must survive an unreadable APK cache.
        this.update({ release, phase: "available" });
        const recovered = release.artifact
          ? await this.ports.artifact.recover(release)
          : false;
        this.update({
          release,
          phase: recovered ? "ready" : "available",
          bytes: recovered ? release.artifact!.size : 0,
        });
      }
    } catch {
      this.update({ error: "storage" });
    }
    this.update({ initialized: true });
  }
  check(manual = true): Promise<void> {
    if (this.checking) return this.checking;
    this.checking = this.performCheck(manual).finally(() => {
      this.checking = null;
    });
    return this.checking;
  }
  private async performCheck(manual: boolean) {
    await this.initialize();
    if (
      this.transfer ||
      this.state.phase === "installing" ||
      this.state.installed.platform === "web"
    )
      return;
    if (
      !manual &&
      this.preferences.lastCheckedAt !== null &&
      this.ports.now() - this.preferences.lastCheckedAt < 86_400_000
    )
      return;
    this.update({ checking: true, checkFailed: false });
    try {
      await this.persist({ lastCheckedAt: this.ports.now() });
      const raw = await this.ports.check(this.state.installed);
      const release =
        raw === null ? null : parseAppRelease(raw, this.state.installed);
      if (!release || release.buildNumber <= this.state.installed.buildNumber) {
        await this.persist({ release: null });
        this.update({ phase: "current", release: null, bytes: 0, error: null });
      } else {
        this.update({ release, phase: "available", bytes: 0, error: null });
        await this.persist({ release });
        try {
          const ready = release.artifact
            ? await this.ports.artifact.recover(release)
            : false;
          this.update({
            phase: ready ? "ready" : "available",
            bytes: ready ? release.artifact!.size : 0,
          });
        } catch (error) {
          this.update({
            error: error instanceof UpdateFailure ? error.code : "storage",
          });
        }
      }
    } catch {
      this.update({ checkFailed: true });
    } finally {
      this.update({ checking: false });
    }
  }
  async download() {
    const release = this.state.release;
    if (
      !release?.artifact ||
      this.transfer ||
      this.checking ||
      ["ready", "installing", "permission"].includes(this.state.phase)
    )
      return;
    const controller = new AbortController();
    this.transfer = controller;
    this.update({ phase: "downloading", error: null });
    try {
      await this.ports.artifact.download(
        release,
        controller.signal,
        (bytes) => {
          if (this.transfer !== controller || controller.signal.aborted) return;
          const actual = Math.min(release.artifact!.size, Math.max(0, bytes));
          this.update({
            bytes: actual,
            phase:
              actual >= release.artifact!.size ? "verifying" : "downloading",
          });
        },
      );
      this.update(
        controller.signal.aborted
          ? { phase: "paused" }
          : { phase: "ready", bytes: release.artifact.size },
      );
    } catch (error) {
      const code = failure(error);
      this.update(
        controller.signal.aborted || code === "cancelled"
          ? { phase: "paused" }
          : { phase: "error", error: code },
      );
    } finally {
      if (this.transfer === controller) this.transfer = null;
    }
  }
  pause() {
    if (!this.transfer || this.state.phase === "verifying") return;
    this.transfer.abort();
    this.update({ phase: "paused" });
  }
  async install() {
    const release = this.state.release;
    if (
      !release ||
      this.checking ||
      this.transfer ||
      (release.artifact &&
        !["ready", "permission"].includes(this.state.phase)) ||
      this.state.phase === "installing"
    )
      return;
    this.update({ phase: "installing", error: null });
    try {
      const result = await this.ports.artifact.install(release);
      this.update({
        phase:
          result === "permission"
            ? "permission"
            : release.artifact
              ? "ready"
              : "available",
      });
    } catch (error) {
      this.update({ phase: "error", error: failure(error) });
    }
  }
  async openPermissionSettings() {
    try {
      await this.ports.artifact.openPermissionSettings();
    } catch (error) {
      this.update({ error: failure(error) });
    }
  }
  canRemind() {
    return (
      !!this.state.release &&
      !this.state.checking &&
      !this.state.checkFailed &&
      shouldRemindUpdate(
        this.state.release,
        this.state.installed,
        this.preferences,
        this.ports.now(),
      )
    );
  }
  async markReminded() {
    await this.persist({ lastPromptedAt: this.ports.now() });
  }
  async defer() {
    await this.persist({ deferredUntil: this.ports.now() + 86_400_000 });
    this.update({});
  }
  async skip() {
    if (
      !this.state.release ||
      this.state.release.importance !== "normal" ||
      this.state.installed.buildNumber < this.state.release.minSupportedBuild
    )
      return;
    await this.persist({ skippedBuild: this.state.release.buildNumber });
    this.update({});
  }
  async flush() {
    await this.writes;
  }
}
