import { requireOptionalNativeModule } from "expo";
import type { AudioPlayer } from "expo-audio";
import { RangePlayback, type RangeBackend } from "./range-playback";

export function createRangePlayback(player: AudioPlayer): RangePlayback {
  const native = requireOptionalNativeModule<RangeBackend>("SelahAudioRanges");
  return new RangePlayback(
    player,
    native ?? {
      async setRange(_player, start) {
        if (start !== null)
          throw new Error("SelahAudioRanges requires a new native build");
        return 0;
      },
      setPlaying() {},
    },
  );
}
