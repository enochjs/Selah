import { useEffect, useState, useSyncExternalStore } from "react";
import { AppState } from "react-native";
import { localDateKey, selectDailyVerse } from "@selah/content/daily-verses";
import { dailyVerseRuntime } from "../../data/daily-verse-runtime";
import { millisecondsUntilNextDailyDate } from "../../domain/daily-verse";

export function useDailyVerse() {
  const [today, setToday] = useState(() => localDateKey());
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const checkDate = () => {
      clearTimeout(timer);
      setToday(localDateKey());
      timer = setTimeout(checkDate, millisecondsUntilNextDailyDate(new Date()));
    };
    checkDate();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") checkDate(); });
    return () => { clearTimeout(timer); subscription.remove(); };
  }, []);
  const snapshot = useSyncExternalStore(
    dailyVerseRuntime.subscribe,
    dailyVerseRuntime.getSnapshot,
    dailyVerseRuntime.getSnapshot,
  );
  useEffect(() => {
    const refresh = () => {
      void dailyVerseRuntime.refresh(localDateKey());
    };
    refresh();
    const timer = setInterval(refresh, 15 * 60 * 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => {
      clearInterval(timer);
      subscription.remove();
    };
  }, [today]);
  return { ...snapshot, today, ...selectDailyVerse(snapshot.catalog, today) };
}

export function useDailyVerseImage(imageId: string | undefined) {
  const snapshot = useSyncExternalStore(
    dailyVerseRuntime.subscribe,
    dailyVerseRuntime.getSnapshot,
    dailyVerseRuntime.getSnapshot,
  );
  useEffect(() => {
    if (imageId) void dailyVerseRuntime.ensureImage(imageId);
  }, [imageId]);
  return imageId ? snapshot.images[imageId] : undefined;
}
