import React, { useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { ArrowLeft, MoreHorizontal } from "lucide-react-native";
import { useI18n } from "../../shared/i18n";
import { colors as c } from "../../shared/theme";
import { Button, IconButton, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";
import { AudioControlsDialog } from "./AudioControlsDialog";
import { HymnNowPlaying } from "./HymnNowPlaying";

export function HymnPlayerScreen() {
  const { bi } = useI18n();
  const audio = useAudio();
  const [section, setSection] = useState<"settings" | "queue" | null>(null);
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/music");
  };
  return (
    <View style={{ flex: 1, minHeight: 0, backgroundColor: c.bg }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingVertical: 6,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          onPress={back}
          label={bi("返回聆听", "Back to listening")}
          size={20}
        />
        <Txt
          accessibilityRole="header"
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: 11,
            letterSpacing: 2,
            color: c.green,
          }}
        >
          {bi("此刻 · 聆听", "NOW PLAYING")}
        </Txt>
        {audio.track?.kind === "hymn" ? (
          <IconButton
            icon={MoreHorizontal}
            onPress={() => setSection("settings")}
            label={bi("播放设置", "Playback settings")}
            size={21}
          />
        ) : (
          <View style={{ width: 44 }} />
        )}
      </View>
      {audio.track?.kind === "hymn" ? (
        <HymnNowPlaying onRequestControls={setSection} />
      ) : (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            gap: 16,
          }}
        >
          <Txt style={{ color: c.muted }}>
            {bi("选一首诗歌，安静聆听。", "Choose a song and settle in.")}
          </Txt>
          <Button secondary onPress={() => router.replace("/music")}>
            {bi("浏览诗歌", "Browse songs")}
          </Button>
        </View>
      )}
      <AudioControlsDialog
        visible={section !== null}
        initialSection={section ?? "settings"}
        onClose={() => setSection(null)}
      />
    </View>
  );
}
