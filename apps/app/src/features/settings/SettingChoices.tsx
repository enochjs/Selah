import React from "react";
import { Pressable, View } from "react-native";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";

export function SettingChoices<T extends string | number>({
  label,
  value,
  options,
  onChange,
  compact = false,
  stacked = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  compact?: boolean;
  stacked?: boolean;
}) {
  const { colors: c } = useTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: stacked ? "column" : "row",
        backgroundColor: c.surfaceMuted,
        borderRadius: 10,
        padding: 3,
        gap: 3,
        width: compact ? 148 : "100%",
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={label + " · " + option.label}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: stacked ? undefined : 1,
              minWidth: 0,
              minHeight: 44,
              paddingHorizontal: stacked ? 12 : 3,
              paddingVertical: 9,
              alignItems: stacked ? "flex-start" : "center",
              justifyContent: "center",
              borderRadius: 7,
              borderWidth: 1,
              borderColor: selected ? c.border : "transparent",
              backgroundColor: selected ? c.surface : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Txt
              style={{
                fontSize: 12,
                fontFamily: selected ? fonts.bold : fonts.regular,
                color: selected ? c.primary : c.textMuted,
              }}
            >
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
