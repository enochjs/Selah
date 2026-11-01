import type { AudioPlayer } from "expo-audio";
import { RangePlayback } from "./range-playback";

// Browsers use the chapter timeline through playback status events. Native
// builds override this factory with engine-owned boundaries and repetition.
export function createRangePlayback(player: AudioPlayer): RangePlayback {
  return new RangePlayback(player);
}
