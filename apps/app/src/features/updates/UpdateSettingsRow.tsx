import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { ChevronRight, RefreshCw } from "lucide-react-native";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { useAppUpdates } from "./AppUpdatesProvider";
export function UpdateSettingsRow() {
  const { colors: c } = useTheme();
  const { state } = useAppUpdates();
  const { bi } = useI18n();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bi("检查应用更新", "Check for app updates")}
      onPress={() => router.push("/updates")}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 18,
        minHeight: 64,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <RefreshCw size={19} color={c.primary} strokeWidth={1.6} aria-hidden />
      <View style={{ flex: 1, gap: 5 }}>
        <Txt style={{ fontFamily: fonts.medium }}>
          {bi("检查更新", "Check for updates")}
        </Txt>
        <Txt style={{ color: c.textMuted, fontSize: 12 }}>
          {bi("当前版本", "Current version")} {state.installed.version}
          {state.installed.buildNumber > 0
            ? ` (${state.installed.buildNumber})`
            : ""}
        </Txt>
      </View>
      {state.release && (
        <Txt style={{ color: c.primary, fontSize: 12, flexShrink: 1 }}>
          {bi("有新版本", "Update available")}
        </Txt>
      )}
      <ChevronRight
        size={18}
        color={c.textMuted}
        strokeWidth={1.5}
        aria-hidden
      />
    </Pressable>
  );
}
