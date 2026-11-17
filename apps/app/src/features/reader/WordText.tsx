import React, { useRef } from "react";
import { Text } from "react-native";
import { useTheme } from "../../shared/theme-context";
import { useI18n } from "../../shared/i18n";

export interface WordTextProps {
  text: string;
  known: boolean;
  interactive: boolean;
  onSelect?: () => void;
  onLookup: () => void;
}

export function WordText({
  text,
  known,
  interactive,
  onSelect,
  onLookup,
}: WordTextProps) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const held = useRef(false);
  return (
    <Text
      onPressIn={
        interactive
          ? () => {
              held.current = false;
            }
          : undefined
      }
      onPress={
        interactive
          ? (event) => {
              event.stopPropagation();
              if (held.current) return;
              onSelect?.();
            }
          : undefined
      }
      onLongPress={
        interactive
          ? (event) => {
              event.stopPropagation();
              held.current = true;
              onLookup();
            }
          : undefined
      }
      accessibilityHint={
        interactive ? bi("长按查词", "Hold to look up this word") : undefined
      }
      accessibilityActions={
        interactive
          ? [{ name: "longpress", label: bi("查词", "Look up word") }]
          : undefined
      }
      onAccessibilityAction={
        interactive
          ? (event) => {
              if (event.nativeEvent.actionName === "longpress") onLookup();
            }
          : undefined
      }
      style={
        known
          ? {
              color: c.primary,
              textDecorationLine: "underline",
              textDecorationColor: c.wordUnderline,
            }
          : undefined
      }
    >
      {text}
    </Text>
  );
}
