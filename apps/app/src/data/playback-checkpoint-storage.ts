import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PlaybackCheckpoint } from "../domain/playback-checkpoint";
const key = "selah-update-playback-checkpoint-v1";
export const playbackCheckpointStorage = {
  async read(): Promise<unknown> {
    const saved = await AsyncStorage.getItem(key);
    return saved ? (JSON.parse(saved) as unknown) : null;
  },
  write(value: PlaybackCheckpoint): Promise<void> {
    return AsyncStorage.setItem(key, JSON.stringify(value));
  },
  clear(): Promise<void> {
    return AsyncStorage.removeItem(key);
  },
};
