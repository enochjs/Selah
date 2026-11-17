import { expect, it } from "vitest";
import {
  createPlaybackCheckpoint,
  restorePlaybackCheckpoint,
} from "../src/domain/playback-checkpoint";
import type { AudioTrack } from "../src/domain/models";
const track: AudioTrack = {
  id: "song",
  kind: "hymn",
  title: "Song",
  subtitle: "",
  source: { uri: "canonical" },
  artwork: 1,
  duration: 40,
};
const saved = () =>
  createPlaybackCheckpoint(10, [track], 0, 12, {
    rate: 1.5,
    volume: 0.4,
    repeat: "chapter",
  });
it("stores identities and settings without serializing media URIs", () => {
  const checkpoint = saved();
  expect(JSON.stringify(checkpoint)).not.toContain("canonical");
  expect(checkpoint).toMatchObject({
    buildNumber: 10,
    position: 12,
    rate: 1.5,
    volume: 0.4,
    repeat: "chapter",
  });
});
it("restores only after native build increases using canonical tracks", () => {
  expect(restorePlaybackCheckpoint(saved(), 10, () => track).status).toBe(
    "unchanged",
  );
  const result = restorePlaybackCheckpoint(saved(), 11, () => track);
  expect(result).toMatchObject({
    status: "ready",
    queue: [track],
    index: 0,
    position: 12,
  });
});
it("does not substitute another song when the saved current track is gone", () => {
  expect(restorePlaybackCheckpoint(saved(), 11, () => null).status).toBe(
    "unavailable",
  );
});
it("rejects corrupt checkpoints and clamps changed recording duration", () => {
  expect(
    restorePlaybackCheckpoint({ ...saved(), rate: NaN }, 11, () => track)
      .status,
  ).toBe("invalid");
  expect(
    restorePlaybackCheckpoint(saved(), 11, () => ({ ...track, duration: 5 })),
  ).toMatchObject({ position: 5 });
  expect(
    restorePlaybackCheckpoint(
      {
        ...saved(),
        queue: [{ id: "song", kind: "hymn", source: { uri: "evil" } }],
      },
      11,
      () => track,
    ).status,
  ).toBe("ready");
});
