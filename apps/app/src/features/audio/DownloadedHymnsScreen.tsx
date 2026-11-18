import { ScrollView, useWindowDimensions } from "react-native";
import { OfflineHymnsSection } from "../downloads/OfflineHymnsSection";
import { useI18n } from "../../shared/i18n";
import {
  libraryGutter,
  MusicLibraryHeader,
  MusicLibraryView,
} from "./MusicLibraryView";

export function DownloadedHymnsScreen() {
  const { width } = useWindowDimensions();
  const { bi } = useI18n();
  return (
    <MusicLibraryView>
      <MusicLibraryHeader title={bi("已下载", "Downloaded")} back />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: libraryGutter(width),
          paddingBottom: 24,
        }}
      >
        <OfflineHymnsSection standalone />
      </ScrollView>
    </MusicLibraryView>
  );
}
