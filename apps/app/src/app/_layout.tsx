import React from "react";
import { ThemeProvider } from "../shared/ThemeProvider";
import { View, ActivityIndicator, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { Lora_400Regular_Italic } from "@expo-google-fonts/lora/400Regular_Italic";
import { AudioProvider } from "../features/audio/AudioProvider";
import { OfflineAudioProvider } from "../features/downloads/OfflineAudioProvider";
import { Shell } from "../shared/Shell";
import { useAppStore } from "../state/app-store";
import { useTheme } from "../shared/theme-context";
import { AppUpdatesProvider } from "../features/updates/AppUpdatesProvider";
import { UsageTracker } from "../features/usage/UsageTracker";
import "../shared/web.css";
export default function RootLayout() {
  return (
    <ThemeProvider>
      <RootContent />
    </ThemeProvider>
  );
}

function RootContent() {
  const { colors: c } = useTheme();
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    Lora_400Regular,
    Lora_400Regular_Italic,
    SelahScriptureSC_400Regular: require("../../assets/fonts/SelahScriptureSC-Regular.ttf"),
    SourceSerif4_400Regular: require("../../assets/fonts/SourceSerif4-Regular.ttf"),
    SelahSansSC_400Regular: require("../../assets/fonts/SelahSansSC-Regular.ttf"),
    SelahWenKai_400Regular: require("../../assets/fonts/SelahWenKai-Regular.ttf"),
  });
  const hydrated = useAppStore((s) => s.hydrated);
  if ((!fontsLoaded && !fontError) || !hydrated)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: c.background,
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Text style={{ color: c.primary, fontSize: 32 }}>selah.</Text>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <OfflineAudioProvider>
        <AudioProvider>
          <UsageTracker />
          <AppUpdatesProvider>
            <Shell />
          </AppUpdatesProvider>
        </AudioProvider>
      </OfflineAudioProvider>
    </SafeAreaProvider>
  );
}
