import { useLocalSearchParams } from "expo-router";
import { HymnSearchScreen } from "../../features/audio/HymnSearchScreen";

export default function Search() {
  const { playlistId } = useLocalSearchParams<{ playlistId?: string }>();
  return (
    <HymnSearchScreen key={playlistId ?? "search"} playlistId={playlistId} />
  );
}
