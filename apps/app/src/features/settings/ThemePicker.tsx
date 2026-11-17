import React from "react";
import { View, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { themeIds } from "../../domain/appearance";
import { useAppStore } from "../../state/app-store";
import { useTheme } from "../../shared/theme-context";
import { themes } from "../../shared/theme-palettes";
import { fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";

export function ThemePicker() {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const preference = useAppStore((state) => state.themePreference);
  const setPreference = useAppStore((state) => state.setThemePreference);
  const followsSystem = preference === "system";
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={bi("外观主题", "Appearance theme")}
      style={{ gap: 12 }}
    >
      <Pressable
        accessibilityRole="radio"
        accessibilityLabel={bi("跟随系统", "Follow system")}
        accessibilityState={{ checked: followsSystem }}
        aria-checked={followsSystem}
        onPress={() => setPreference("system")}
        style={({ pressed }) => ({
          minHeight: 48,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: followsSystem ? c.primary : c.border,
          backgroundColor: followsSystem ? c.primarySoft : c.surface,
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          opacity: pressed ? 0.65 : 1,
        })}
      >
        <Txt style={{ flex: 1, fontFamily: fonts.medium }}>
          {bi("跟随系统", "Follow system")}
        </Txt>
        {followsSystem && (
          <Check
            size={18}
            color={c.primary}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        )}
      </Pressable>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
        {themeIds.map((id) => {
          const theme = themes[id];
          const preview = theme.colors;
          const selected = preference === id;
          const name = bi(theme.name.zh, theme.name.en);
          return (
            <Pressable
              key={id}
              accessibilityRole="radio"
              accessibilityLabel={name}
              accessibilityState={{ checked: selected }}
              aria-checked={selected}
              onPress={() => setPreference(id)}
              style={({ pressed }) => ({
                flexBasis: "45%",
                flexGrow: 1,
                minWidth: 110,
                borderWidth: 2,
                borderColor: selected ? c.primary : c.border,
                borderRadius: 12,
                overflow: "hidden",
                backgroundColor: c.surface,
                opacity: pressed ? 0.7 : 1,
              })}
            >
              <View
                accessible={false}
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={{
                  padding: 12,
                  height: 78,
                  backgroundColor: preview.background,
                  gap: 7,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  {id === "redemption" ? (
                    <View style={{ width: 10, height: 12 }}>
                      <View
                        style={{
                          position: "absolute",
                          left: 4,
                          width: 2,
                          height: 12,
                          backgroundColor: preview.primary,
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: 3,
                          left: 1,
                          width: 8,
                          height: 2,
                          backgroundColor: preview.primary,
                        }}
                      />
                    </View>
                  ) : (
                    <View
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: 4,
                        backgroundColor: preview.primary,
                      }}
                    />
                  )}
                  <View
                    style={{
                      height: 3,
                      width: "40%",
                      backgroundColor: preview.text,
                      borderRadius: 2,
                    }}
                  />
                </View>
                <View
                  style={{
                    backgroundColor: preview.surface,
                    borderColor: preview.border,
                    borderWidth: 1,
                    borderRadius: 5,
                    padding: 7,
                    gap: 5,
                  }}
                >
                  <View
                    style={{
                      height: 3,
                      width: "86%",
                      backgroundColor: preview.text,
                      opacity: 0.8,
                      borderRadius: 2,
                    }}
                  />
                  <View
                    style={{
                      height: 9,
                      backgroundColor: preview.readingActive,
                      borderLeftColor: preview.readingAccent,
                      borderLeftWidth: 2,
                      borderRadius: 1,
                    }}
                  />
                </View>
                {selected && (
                  <View
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: preview.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Check size={14} color={preview.onPrimary} />
                  </View>
                )}
              </View>
              <View
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  minHeight: 48,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Txt
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontFamily: selected ? fonts.bold : fonts.medium,
                  }}
                >
                  {name}
                </Txt>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
