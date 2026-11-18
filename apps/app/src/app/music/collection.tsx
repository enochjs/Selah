import { useLocalSearchParams } from "expo-router";
import { MusicCollectionScreen } from "../../features/audio/MusicCollectionScreen";

export default function Collection() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  return <MusicCollectionScreen key={`${kind}:${id}`} kind={kind} id={id} />;
}
