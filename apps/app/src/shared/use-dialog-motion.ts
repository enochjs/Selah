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
  bottom: boolean,
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
  }, []);

  const driver = useMemo<DialogMotionDriver>(
    () => ({
      stop: () => {
        values.backdrop.stopAnimation();
        values.panel.stopAnimation();
      },
      animate: (opening, complete) => {
        const timing = dialogTiming(reducedMotion, opening);
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
    [values, reducedMotion],
  );
  useEffect(() => {
    if (visible) {
      motion.open(driver);
    } else
      motion.close(driver, () => {
        setPresented(false);
        dismissed.current?.();
      });
    return () => motion.cancel(driver);
  }, [visible, driver, motion]);

  const panelStyle = useMemo(
    () =>
      bottom
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
        : { opacity: values.panel },
    [bottom, values, height],
  );
  return {
    modalVisible: visible || presented,
    onShow: () => {
      if (visible) setPresented(true);
    },
    backdropStyle: { opacity: values.backdrop },
    panelStyle,
  };
}
