import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Easing, Platform } from "react-native";
import { ChapterMotion, type ChapterMotionDriver } from "./chapter-motion";

export function useChapterMotion(chapterKey: string) {
  const [busy, setBusy] = useState(false);
  const reducedMotion = useRef<boolean | null>(null);
  const [values] = useState(() => ({
    x: new Animated.Value(0),
    opacity: new Animated.Value(1),
  }));
  const driver = useMemo<ChapterMotionDriver>(
    () => ({
      stop: () => {
        values.x.stopAnimation();
        values.opacity.stopAnimation();
      },
      set: (frame) => {
        values.x.setValue(frame.x);
        values.opacity.setValue(frame.opacity);
      },
      animate: (frame, duration, complete) => {
        const config = {
          duration,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: Platform.OS !== "web",
        };
        Animated.parallel([
          Animated.timing(values.x, { ...config, toValue: frame.x }),
          Animated.timing(values.opacity, {
            ...config,
            toValue: frame.opacity,
          }),
        ]).start(({ finished }) => complete(finished));
      },
    }),
    [values],
  );
  const [motion] = useState(
    () => new ChapterMotion(chapterKey, driver, setBusy),
  );

  useLayoutEffect(() => {
    motion.show(chapterKey);
  }, [motion, chapterKey]);
  useEffect(() => {
    let active = true;
    const update = (value: boolean) => {
      if (!active) return;
      reducedMotion.current = value;
      if (value) motion.cancel();
    };
    void AccessibilityInfo.isReduceMotionEnabled()
      .then(update)
      .catch(() => update(true));
    const listener = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      update,
    );
    return () => {
      active = false;
      listener.remove();
      motion.cancel();
    };
  }, [motion]);

  return {
    busy,
    style: { opacity: values.opacity, transform: [{ translateX: values.x }] },
    turn: (
      key: string,
      direction: -1 | 1,
      width: number,
      navigate: () => void,
    ) => motion.turn(key, direction, width, reducedMotion.current, navigate),
    drag: (dx: number, width: number, previous: boolean, next: boolean) => {
      if (reducedMotion.current === false)
        motion.drag(dx, width, previous, next);
    },
    settle: () => motion.settle(reducedMotion.current),
  };
}
