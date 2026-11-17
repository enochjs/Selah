import React, { useEffect, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  Platform,
  View,
  type ImageSourcePropType,
} from "react-native";
import { colors as c } from "../../shared/theme";

/** Decorative record; playback remains owned by the global audio session. */
export function RecordArtwork({
  source,
  playing,
  size,
  ringWidth = 3,
}: {
  source: ImageSourcePropType;
  playing: boolean;
  size: number;
  ringWidth?: number;
}) {
  const [rotation] = useState(() => new Animated.Value(0));
  const [reducedMotion, setReducedMotion] = useState(true);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReducedMotion(value);
      })
      .catch(() => {
        /* Keep the static fallback when unavailable. */
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
    if (!playing || reducedMotion || !foreground) return;
    let disposed = false;
    let animation: Animated.CompositeAnimation | undefined;
    const turn = (phase: number) => {
      if (disposed) return;
      animation = Animated.timing(rotation, {
        toValue: 1,
        duration: Math.round(18000 * (1 - phase)),
        easing: Easing.linear,
        useNativeDriver: Platform.OS !== "web",
        isInteraction: false,
      });
      animation.start(({ finished }) => {
        if (!finished || disposed) return;
        rotation.setValue(0);
        turn(0);
      });
    };
    rotation.stopAnimation(turn);
    return () => {
      disposed = true;
      animation?.stop();
      rotation.stopAnimation();
    };
  }, [foreground, playing, reducedMotion, rotation]);
  return (
    <Animated.View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: c.ink,
        padding: ringWidth,
        alignItems: "center",
        justifyContent: "center",
        transform: [
          {
            rotate: rotation.interpolate({
              inputRange: [0, 1],
              outputRange: ["0deg", "360deg"],
            }),
          },
        ],
      }}
    >
      <Image
        source={source}
        accessibilityIgnoresInvertColors
        style={{
          width: size - ringWidth * 2,
          height: size - ringWidth * 2,
          borderRadius: size / 2,
        }}
      />
      <View
        style={{
          position: "absolute",
          width: 7,
          height: 7,
          borderRadius: 4,
          backgroundColor: c.paper,
          borderWidth: 2,
          borderColor: c.ink,
        }}
      />
    </Animated.View>
  );
}
