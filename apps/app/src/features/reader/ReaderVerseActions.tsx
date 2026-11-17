import React from "react";
import { Animated, Pressable, View } from "react-native";
import { Bookmark, Pause, Play, Repeat1, X } from "lucide-react-native";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { IconButton, Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";
import { useVerseActionsMotion } from "./use-verse-actions-motion";

interface Props {
  visible: boolean;
  verse: number;
  reference: string;
  saved: boolean;
  loaded: boolean;
  playing: boolean;
  repeating: boolean;
  playable: boolean;
  onBookmark: () => void;
  onPlay: () => void;
  onRepeat: () => void;
  onDismiss: () => void;
}

/** Floating controls above navigation, independent of the reading viewport. */
export function ReaderVerseActions({
  visible,
  verse,
  reference,
  saved,
  loaded,
  playing,
  repeating,
  playable,
  onBookmark,
  onPlay,
  onRepeat,
  onDismiss,
}: Props) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const motion = useVerseActionsMotion(visible);
  if (!motion.mounted) return null;
  const status = repeating
    ? playing
      ? bi("正在重复", "Repeating")
      : bi("重复已暂停", "Repeat paused")
    : loaded
      ? playing
        ? bi("正在朗读", "Playing")
        : bi("已暂停", "Paused")
      : bi("已选中", "Selected");
  return (
    <View
      pointerEvents="box-none"
      style={{
        position: "absolute",
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: 12,
        paddingBottom: 10,
      }}
    >
      <Animated.View
        accessibilityLabel={bi("经节操作", "Verse actions")}
        pointerEvents={visible ? "auto" : "none"}
        accessibilityElementsHidden={!visible}
        importantForAccessibility={visible ? "auto" : "no-hide-descendants"}
        style={[
          {
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: c.surface,
            borderWidth: 1,
            borderColor: c.border,
            borderRadius: 24,
            paddingLeft: 18,
            paddingRight: 8,
            paddingVertical: 10,
            gap: 8,
            boxShadow: c.floatingShadow,
          },
          motion.style,
        ]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Txt
            numberOfLines={1}
            style={{
              fontFamily: fonts.medium,
              fontSize: 14,
              lineHeight: 20,
              color: c.text,
            }}
          >
            {reference}
          </Txt>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            {playing && (
              <View
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: 2,
                  backgroundColor: c.primary,
                }}
              />
            )}
            <Txt
              numberOfLines={1}
              style={{
                fontSize: 11,
                lineHeight: 16,
                color: playing || repeating ? c.primary : c.textMuted,
              }}
            >
              {status}
            </Txt>
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi(
              playing
                ? `暂停第 ${verse} 节`
                : loaded
                  ? `继续朗读第 ${verse} 节`
                  : `朗读第 ${verse} 节`,
              playing
                ? `Pause verse ${verse}`
                : loaded
                  ? `Resume verse ${verse}`
                  : `Listen to verse ${verse}`,
            )}
            disabled={!playable}
            accessibilityState={{ disabled: !playable }}
            onPress={onPlay}
            style={({ pressed }) => ({
              width: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: pressed ? c.primaryStrong : c.primary,
              opacity: playable ? 1 : 0.4,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            {playing ? (
              <Pause size={18} color={c.onPrimary} fill={c.onPrimary} />
            ) : (
              <Play
                size={18}
                color={c.onPrimary}
                fill={c.onPrimary}
                style={{ marginLeft: 2 }}
              />
            )}
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              repeating
                ? bi("退出单节重复", "Exit verse repeat")
                : bi(`循环第 ${verse} 节`, `Loop verse ${verse}`)
            }
            accessibilityState={{ selected: repeating, disabled: !playable }}
            disabled={!playable}
            onPress={onRepeat}
            style={({ pressed }) => ({
              width: 44,
              minHeight: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 22,
              backgroundColor: repeating
                ? c.primarySoft
                : pressed
                  ? c.surfaceMuted
                  : "transparent",
              opacity: playable ? 1 : 0.4,
              transform: [{ scale: pressed ? 0.94 : 1 }],
            })}
          >
            <Repeat1
              size={20}
              strokeWidth={repeating ? 2.3 : 1.7}
              color={repeating ? c.primary : c.textMuted}
            />
          </Pressable>
          <IconButton
            icon={Bookmark}
            active={saved}
            fillActive
            size={19}
            label={bi(
              saved ? `取消收藏第 ${verse} 节` : `收藏第 ${verse} 节`,
              saved
                ? `Remove bookmark for verse ${verse}`
                : `Bookmark verse ${verse}`,
            )}
            onPress={onBookmark}
          />
          {!repeating && (
            <IconButton
              icon={X}
              size={17}
              label={bi("收起经节操作", "Hide verse actions")}
              onPress={onDismiss}
            />
          )}
        </View>
      </Animated.View>
    </View>
  );
}
