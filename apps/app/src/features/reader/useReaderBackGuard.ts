import { useCallback } from "react";
import { BackHandler, Platform } from "react-native";
import { useFocusEffect } from "expo-router";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { ReaderBackGuard } from "./reader-back";

export function useReaderBackGuard(enabled: boolean) {
  const { bi } = useI18n();
  const message = bi(
    "再次滑动屏幕边缘可返回",
    "Swipe from the edge again to go back",
  );
  useFocusEffect(
    useCallback(() => {
      if (Platform.OS !== "android" || !enabled) return;
      const guard = new ReaderBackGuard();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const clearHint = () => {
        if (timer) clearTimeout(timer);
        if (useAppStore.getState().toast === message)
          useAppStore.getState().notify(null);
      };
      const listener = BackHandler.addEventListener("hardwareBackPress", () => {
        const state = useAppStore.getState();
        const handled = guard.handle(
          Date.now(),
          `${state.bookId}:${state.chapter}`,
        );
        clearHint();
        if (handled) {
          useAppStore.getState().notify(message);
          timer = setTimeout(clearHint, 1500);
        }
        return handled;
      });
      return () => {
        listener.remove();
        clearHint();
      };
    }, [enabled, message]),
  );
}
