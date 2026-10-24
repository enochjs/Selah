import { expect, it, vi } from "vitest";
import { DownloadBackgroundController } from "../src/data/download-background";
import type { OfflineState } from "../src/domain/offline-audio";

const file = { path: "/audio.mp3", sha256: "a".repeat(64), size: 100 };
function state(): OfflineState {
  return {
    ready: true,
    wifiOnly: true,
    network: "wifi",
    activePath: file.path,
    activeBytes: 30,
    assets: {},
    chapters: {
      one: {
        key: "one",
        bookId: "psalms",
        chapter: 23,
        locale: "en",
        recording: { path: file.path, duration: 10, segments: [] },
        files: [file],
        status: "downloading",
      },
    },
  };
}
function setup() {
  const port = { update: vi.fn(), stop: vi.fn() };
  return { port, controller: new DownloadBackgroundController(port) };
}

it("keeps the native service alive across chapter boundaries and Wi-Fi waits", () => {
  const { port, controller } = setup();
  const snapshot = state();
  controller.update(snapshot);
  expect(port.update).toHaveBeenLastCalledWith({
    completed: 0,
    total: 1,
    percent: 30,
    waiting: false,
  });
  snapshot.chapters.one.status = "queued";
  controller.update(snapshot);
  snapshot.chapters.one.status = "waiting";
  snapshot.activeBytes = 0;
  controller.update(snapshot);
  expect(port.update).toHaveBeenLastCalledWith({
    completed: 0,
    total: 1,
    percent: 0,
    waiting: true,
  });
  expect(port.stop).not.toHaveBeenCalled();
});

it.each(["paused", "complete", "failed"] as const)(
  "releases the native service when the queue becomes %s",
  (status) => {
    const { port, controller } = setup();
    const snapshot = state();
    controller.update(snapshot);
    snapshot.chapters.one.status = status;
    controller.update(snapshot);
    controller.update(snapshot);
    expect(port.stop).toHaveBeenCalledOnce();
  },
);

it("counts shared files once and avoids reposting unchanged progress", () => {
  const { port, controller } = setup();
  const snapshot = state();
  snapshot.chapters.two = {
    ...snapshot.chapters.one,
    key: "two",
    status: "queued",
  };
  controller.update(snapshot);
  controller.update({ ...snapshot, activeBytes: 30.1 });
  expect(port.update).toHaveBeenCalledOnce();
  snapshot.assets[file.path] = { ...file, uri: "offline:a" };
  snapshot.activeBytes = 0;
  controller.update(snapshot);
  expect(port.update).toHaveBeenLastCalledWith({
    completed: 0,
    total: 2,
    percent: 100,
    waiting: false,
  });
});
