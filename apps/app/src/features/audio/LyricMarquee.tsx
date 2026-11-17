import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Platform,
  ScrollView,
  View,
} from "react-native";
import { Txt } from "../../shared/ui";
import { useTheme } from "../../shared/theme-context";

/** The horizontal content measures the full sentence without constraining its width. */
export function LyricMarquee({
  text,
  playing,
  compact = false,
}: {
  text: string;
  playing: boolean;
  compact?: boolean;
}) {
  const { colors: c } = useTheme();
  const [viewportWidth, setViewportWidth] = useState(0);
  const [textWidth, setTextWidth] = useState(0);
  const [offset] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const overflows = viewportWidth > 0 && textWidth > viewportWidth + 1;
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReducedMotion(value);
      })
      .catch(() => {
        /* Keep the static, accessible fallback if unavailable. */
      });
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    const appState = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    return () => {
      active = false;
      motion.remove();
      appState.remove();
    };
  }, []);
  useEffect(() => {
    offset.setValue(0);
    if (!overflows || !playing || reducedMotion || !foreground) return;
    const distance = textWidth + 32;
    const animation = Animated.loop(
      Animated.sequence([
        Animated.delay(1200),
        Animated.timing(offset, {
          toValue: -distance,
          duration: Math.round((distance / 28) * 1000),
          easing: Easing.linear,
          useNativeDriver: Platform.OS !== "web",
          isInteraction: false,
        }),
      ]),
    );
    animation.start();
    return () => {
      animation.stop();
      offset.setValue(0);
    };
  }, [
    foreground,
    offset,
    overflows,
    playing,
    reducedMotion,
    textWidth,
    viewportWidth,
  ]);
  const textStyle = {
    color: c.textMuted,
    fontSize: compact ? 11 : 12,
    lineHeight: compact ? 16 : 18,
    flexShrink: 0,
  };
  return (
    <View
      onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}
      style={{ overflow: "hidden", minWidth: 0 }}
    >
      <ScrollView
        horizontal
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        pointerEvents="none"
        accessible={false}
      >
        <Animated.View
          style={{
            flexDirection: "row",
            alignItems: "center",
            transform: [{ translateX: offset }],
          }}
        >
          <Txt
            onLayout={(event) => setTextWidth(event.nativeEvent.layout.width)}
            numberOfLines={1}
            style={textStyle}
          >
            {text}
          </Txt>
          {overflows && !reducedMotion && (
            <Txt
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              numberOfLines={1}
              style={[textStyle, { marginLeft: 32 }]}
            >
              {text}
            </Txt>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  );
}
