import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
  const [dismissal, setDismissal] = useState<object | null>(null);
  const pendingDismissal = useRef<object | null>(null);
  const [reducedMotion, setReducedMotion] = useState<boolean | null>(null);
  const [motion] = useState(() => new DialogMotion());
  const [values] = useState(() => ({
    backdrop: new Animated.Value(0),
    panel: new Animated.Value(0),
  }));
  const dismissed = useRef(onDismiss);
  const requestedVisible = useRef(visible);
  useLayoutEffect(() => {
    dismissed.current = onDismiss;
    requestedVisible.current = visible;
  }, [onDismiss, visible]);
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
      // A host already tearing down must finish before it can present again.
      // Interrupting the panel animation before this boundary stays immediate.
      if (!pendingDismissal.current) motion.open(driver);
    } else
      motion.close(driver, () => {
        const token = {};
        pendingDismissal.current = token;
        setDismissal(token);
        setPresented(false);
      });
    return () => motion.cancel(driver);
  }, [visible, driver, motion]);

  useEffect(
    () => () => {
      pendingDismissal.current = null;
    },
    [],
  );

  // Capture the close rendered to this host. Duplicate or interrupted host
  // completions must never execute a later dialog's handoff.
  const completeDismissal = useMemo(
    () => () => {
      if (presented || !dismissal || pendingDismissal.current !== dismissal)
        return;
      pendingDismissal.current = null;
      setDismissal(null);
      if (requestedVisible.current) motion.open(driver);
      else dismissed.current?.();
    },
    [presented, dismissal, motion, driver],
  );

  useEffect(() => {
    // Android Modal removes its content in the hidden React commit, but has no
    // onDismiss event. iOS and Web signal after their host teardown instead.
    if (Platform.OS === "android") completeDismissal();
  }, [completeDismissal]);

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
    modalVisible: (visible && !dismissal) || presented,
    onDismiss: completeDismissal,
    onShow: () => {
      if (requestedVisible.current && !pendingDismissal.current)
        setPresented(true);
    },
    backdropStyle: { opacity: values.backdrop },
    panelStyle,
  };
}
