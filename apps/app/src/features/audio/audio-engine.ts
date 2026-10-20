import type { AudioPlayer } from "expo-audio";
/** Expo's player is an imperative external resource, not immutable React state.
 * A web source replacement creates a new media element, so reapply every setting.
 */
export function configurePlayer(
  player: AudioPlayer,
  options: { loop?: boolean; volume?: number; rate?: number },
): void {
  if (options.loop !== undefined) player.loop = options.loop;
  if (options.volume !== undefined) player.volume = options.volume;
  if (options.rate !== undefined) player.setPlaybackRate(options.rate);
}
