import React from "react";
import { Pressable, View } from "react-native";
import { ListEnd, Repeat, Repeat1 } from "lucide-react-native";
import type { RepeatMode } from "../../domain/models";
import { useI18n } from "../../shared/i18n";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { compactPlayerLayout } from "./compact-player-layout";

function hymnRepeatModes(bi: (zh: string, en: string) => string) {
  return [
    {
      value: "off" as const,
      label: bi("顺序播放", "In order"),
      description: bi(
        "按队列依次播放，播完后停止",
        "Play the queue in order, then stop",
      ),
      icon: ListEnd,
    },
    {
      value: "verse" as const,
      label: bi("单曲循环", "Repeat one"),
      description: bi("反复播放当前这一首", "Play the current song on repeat"),
      icon: Repeat1,
    },
    {
      value: "chapter" as const,
      label: bi("列表循环", "Repeat all"),
      description: bi(
        "播完队列后，从第一首重新播放",
        "At the end of the queue, start again from the first song",
      ),
      icon: Repeat,
    },
  ];
}

export function HymnRepeatButton({
  repeat,
  onChange,
  compact = false,
  fontScale = 1,
}: {
  repeat: RepeatMode;
  onChange: (repeat: RepeatMode) => void;
  compact?: boolean;
  fontScale?: number;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const modes = hymnRepeatModes(bi);
  const index = modes.findIndex((item) => item.value === repeat);
  const mode = modes[index];
  const next = modes[(index + 1) % modes.length];
  const Icon = mode.icon;
  const compactLayout = compactPlayerLayout(fontScale);
  const modeColor = compact ? c.textMuted : c.primary;
  const label =
    compact && repeat === "verse" ? bi("单曲循环", "Repeat 1") : mode.label;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={bi(
        `循环方式：${mode.label}`,
        `Repeat mode: ${mode.label}`,
      )}
      accessibilityHint={bi(
        `点击切换为${next.label}`,
        `Switch to ${next.label}`,
      )}
      onPress={() => onChange(next.value)}
      style={({ pressed }) => ({
        width: compact ? 44 : 64,
        flexShrink: 0,
        minHeight: compact ? compactLayout.height : 44,
        paddingHorizontal: compact ? 0 : 4,
        paddingVertical: compact ? 0 : 4,
        alignItems: "center",
        justifyContent: "center",
        gap: compact ? 4 : 3,
        borderRadius: 10,
        backgroundColor: pressed ? c.primarySoft : "transparent",
      })}
    >
      <View
        style={
          compact
            ? {
                height: compactLayout.titleHeight,
                alignItems: "center",
                justifyContent: "center",
              }
            : undefined
        }
      >
        <Icon
          size={compact ? 17 : 18}
          color={modeColor}
          strokeWidth={1.7}
          accessible={false}
        />
      </View>
      <Txt
        numberOfLines={1}
        adjustsFontSizeToFit={compact}
        minimumFontScale={0.9}
        style={{
          fontSize: 10,
          lineHeight: compact ? 16 : 14,
          color: modeColor,
          textAlign: "center",
        }}
      >
        {label}
      </Txt>
    </Pressable>
  );
}
