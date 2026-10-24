import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Platform,
  useWindowDimensions,
} from "react-native";
import {
  DialogMotion,
  dialogTiming,
  type DialogMotionDriver,
} from "./dialog-motion";

export function useDialogMotion(
  visible: boolean,
  enabled: boolean,
  onDismiss?: () => void,
) {
  const { height } = useWindowDimensions();
  const [presented, setPresented] = useState(visible);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [motion] = useState(() => new DialogMotion());
  const [values] = useState(() => ({
    backdrop: new Animated.Value(0),
    panel: new Animated.Value(0),
  }));
  const dismissed = useRef(onDismiss);
  useEffect(() => {
    dismissed.current = onDismiss;
  }, [onDismiss]);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReducedMotion(value);
      })
      .catch(() => {
        if (active) setReducedMotion(true);
      });
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReducedMotion,
    );
    return () => {
      active = false;
      listener.remove();
    };
  }, [enabled]);

  const driver = useMemo<DialogMotionDriver>(
    () => ({
      stop: () => {
        values.backdrop.stopAnimation();
        values.panel.stopAnimation();
      },
      animate: (opening, complete) => {
        const timing = dialogTiming(enabled ? reducedMotion : true, opening);
        if (!timing) return;
        const toValue = opening ? 1 : 0;
        const useNativeDriver = Platform.OS !== "web";
        Animated.parallel([
          Animated.timing(values.backdrop, {
            toValue,
            duration: timing.backdrop,
            useNativeDriver,
          }),
          Animated.timing(values.panel, {
            toValue,
            duration: timing.panel,
            easing: opening
              ? Easing.out(Easing.cubic)
              : Easing.in(Easing.cubic),
            useNativeDriver,
          }),
        ]).start(({ finished }) => complete(finished));
      },
    }),
    [values, reducedMotion, enabled],
  );
  useEffect(() => {
    if (visible) {
      if (enabled) motion.open(driver);
    } else
      motion.close(driver, () => {
        setPresented(false);
        dismissed.current?.();
      });
    return () => motion.cancel(driver);
  }, [visible, enabled, driver, motion]);

  const panelStyle = useMemo(
    () =>
      enabled
        ? {
            transform: [
              {
                translateY: values.panel.interpolate({
                  inputRange: [0, 1],
                  outputRange: [height + 24, 0],
                }),
              },
            ],
          }
        : undefined,
    [enabled, values, height],
  );
  return {
    modalVisible: enabled ? visible || presented : visible,
    onShow: () => {
      if (enabled && visible) setPresented(true);
    },
    backdropStyle: enabled ? { opacity: values.backdrop } : undefined,
    panelStyle,
  };
}
