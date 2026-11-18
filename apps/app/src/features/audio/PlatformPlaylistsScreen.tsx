import React from "react";
import { ScrollView, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { useI18n } from "../../shared/i18n";
import { PlaylistBrowser } from "./PlaylistBrowser";
import { useCloudPlaylists } from "./useCloudPlaylists";
import {
  libraryGutter,
  MusicLibraryHeader,
  MusicLibraryView,
} from "./MusicLibraryView";

export function PlatformPlaylistsScreen() {
  const { width } = useWindowDimensions();
  const { bi } = useI18n();
  const { items, status, refresh } = useCloudPlaylists();
  return (
    <MusicLibraryView>
      <MusicLibraryHeader title={bi("平台歌单", "Selah playlists")} back />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: libraryGutter(width),
          paddingBottom: 28,
        }}
      >
        <PlaylistBrowser
          playlists={items}
          status={status}
          onRetry={() => void refresh()}
          onSelect={(id) =>
            router.push({
              pathname: "/music/collection",
              params: { kind: "cloud", id },
            })
          }
        />
      </ScrollView>
    </MusicLibraryView>
  );
}
