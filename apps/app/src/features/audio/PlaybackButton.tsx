import React from "react";
import { Pressable, View } from "react-native";
import type { LucideIcon } from "lucide-react-native";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";

export function PlaybackButton({
  icon: Icon,
  compact,
  label,
  text,
  onPress,
}: {
  icon: LucideIcon;
  compact: boolean;
  label: string;
  text?: string;
  onPress: () => void;
}) {
  const { colors: c } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        minWidth: 48,
        justifyContent: "center",
        alignItems: "center",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "center",
          alignItems: "center",
          gap: 6,
          minHeight: 32,
          minWidth: compact ? 32 : 88,
          paddingVertical: 5,
          paddingHorizontal: compact ? 7 : 10,
          borderRadius: 16,
          backgroundColor: c.primarySoft,
        }}
      >
        <Icon
          aria-hidden
          size={16}
          strokeWidth={1.65}
          color={c.primaryStrong}
        />
        {!compact && (
          <Txt
            style={{
              fontFamily: fonts.medium,
              color: c.primaryStrong,
              fontSize: 13,
              lineHeight: 20,
            }}
          >
            {text}
          </Txt>
        )}
      </View>
    </Pressable>
  );
}
