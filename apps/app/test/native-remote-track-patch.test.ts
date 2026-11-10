import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("expo-audio/package.json"));
const android = "android/src/main/java/expo/modules/audio";

it("builds the patched audio module from source on both native platforms", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  expect(manifest.expo?.autolinking?.android?.buildFromSource).toContain(
    "expo-audio",
  );
  expect(manifest.expo?.autolinking?.ios?.buildFromSource).toContain(
    "expo-audio",
  );
});

// Runtime bridge tests cover queue behavior. These checks guard the native
// hooks that must survive a clean npm install and an Android/iOS rebuild.
it("bridges single-player remote commands on Android", () => {
  const player = readFileSync(join(root, android, "AudioPlayer.kt"), "utf8");
  expect(player).toContain(
    'emit("remoteTrackChange", mapOf("direction" to "next"))',
  );
  expect(player).toContain(
    'emit("remoteTrackChange", mapOf("direction" to "previous"))',
  );
});

it("advertises and intercepts standard Media3 next and previous commands", () => {
  const player = readFileSync(
    join(root, android, "PlayRequestingPlayer.kt"),
    "utf8",
  );
  expect(player).toContain("override fun getAvailableCommands()");
  expect(player).toContain("override fun isCommandAvailable(command: Int)");
  for (const method of [
    "seekToNext",
    "seekToNextMediaItem",
    "seekToPrevious",
    "seekToPreviousMediaItem",
  ])
    expect(player).toContain(`override fun ${method}()`);
  const service = readFileSync(
    join(root, android, "service/AudioControlsService.kt"),
    "utf8",
  );
  expect(service).toContain(
    "onNext = if (playable is AudioPlayer && playable.supportsNextTrack)",
  );
  expect(service).toContain(
    "onPrevious = if (playable is AudioPlayer && playable.supportsPreviousTrack)",
  );
});

it("bridges the same commands on iOS", () => {
  const player = readFileSync(join(root, "ios/AudioPlayer.swift"), "utf8");
  expect(player).toContain(
    'emit(event: "remoteTrackChange", payload: ["direction": "next"])',
  );
  expect(player).toContain(
    'emit(event: "remoteTrackChange", payload: ["direction": "previous"])',
  );
});

it("keeps standard track buttons out of the legacy custom-action slots", () => {
  const service = readFileSync(
    join(root, android, "service/AudioControlsService.kt"),
    "utf8",
  );
  expect(service).toContain("session.setMediaButtonPreferences(emptyList())");
  expect(service).toContain("session.setCustomLayout(emptyList())");
});

it("preserves logical track commands when ExoPlayer reports new available commands", () => {
  const player = readFileSync(
    join(root, android, "service/MetadataInjectingPlayer.kt"),
    "utf8",
  );
  expect(player).toContain(
    "override fun onAvailableCommandsChanged(availableCommands: Player.Commands)",
  );
  expect(player).toContain(
    "listener.onAvailableCommandsChanged(this@MetadataInjectingPlayer.availableCommands)",
  );
});
