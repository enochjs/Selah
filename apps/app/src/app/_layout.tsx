import React from "react";
import { View, ActivityIndicator, Text } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useFonts } from "expo-font";
import { DMSans_400Regular } from "@expo-google-fonts/dm-sans/400Regular";
import { DMSans_500Medium } from "@expo-google-fonts/dm-sans/500Medium";
import { DMSans_600SemiBold } from "@expo-google-fonts/dm-sans/600SemiBold";
import { Lora_400Regular } from "@expo-google-fonts/lora/400Regular";
import { Lora_400Regular_Italic } from "@expo-google-fonts/lora/400Regular_Italic";
import { StatusBar } from "expo-status-bar";
import { AudioProvider } from "../features/audio/AudioProvider";
import { Shell } from "../shared/Shell";
import { useAppStore } from "../state/app-store";
import { colors } from "../shared/theme";
import "../shared/web.css";
export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_600SemiBold,
    Lora_400Regular,
    Lora_400Regular_Italic,
  });
  const hydrated = useAppStore((s) => s.hydrated);
  if ((!fontsLoaded && !fontError) || !hydrated)
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
          gap: 18,
        }}
      >
        <Text style={{ color: colors.green, fontSize: 32 }}>selah.</Text>
        <ActivityIndicator color={colors.green} />
      </View>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <AudioProvider>
        <Shell />
      </AudioProvider>
    </SafeAreaProvider>
  );
}
