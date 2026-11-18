import type { ImageSourcePropType } from "react-native";
import praise from "../../../assets/playlist-covers/praise-and-worship.jpg";
import prayer from "../../../assets/playlist-covers/quiet-prayer.jpg";
import hope from "../../../assets/playlist-covers/peace-and-hope.jpg";
import gratitude from "../../../assets/playlist-covers/grace-and-gratitude.jpg";
import salvation from "../../../assets/playlist-covers/cross-and-salvation.jpg";
import discipleship from "../../../assets/playlist-covers/surrender-and-discipleship.jpg";
import fellowship from "../../../assets/playlist-covers/blessings-and-fellowship.jpg";
import recordings from "../../../assets/playlist-covers/special-recordings.jpg";

// Selah's curated catalog uses stable IDs across renames, translations, and sorting.
export const curatedPlaylistCovers: ReadonlyMap<string, ImageSourcePropType> =
  new Map([
    ["playlist-cfc782dd-7f95-44e0-ab30-7ab7882b6586", praise],
    ["playlist-cd9d3057-9e29-40fa-a3b7-aafa51e5e868", prayer],
    ["playlist-7c48ba8d-09a5-4e8b-8788-8e60582bca0d", hope],
    ["playlist-88004ec5-f94d-4a19-9945-e55ab6bcb04a", gratitude],
    ["playlist-79ba08b8-ae03-4ec0-a315-00d0eb7f6ba3", salvation],
    ["playlist-a2baaedb-02bd-4e9a-8254-6a5c0d77148f", discipleship],
    ["playlist-a8cd7188-8745-45e0-bff6-3eb7e8c6ae03", fellowship],
    ["playlist-bf4eac44-ff54-4e24-a756-5037ccdeee46", recordings],
  ]);
