import { useCallback, useMemo } from "react";
import { useFocusEffect } from "expo-router";
import { create } from "zustand";
import { fetchEnglishLessons } from "../../data/english-lessons";
import {
  beijingLessonDate,
  selectAvailableLessons,
  type EnglishLesson,
} from "../../domain/english-lessons";
import { useNow } from "../../shared/useNow";

interface CatalogState {
  lessons: EnglishLesson[];
  status: "idle" | "loading" | "ready" | "error";
}

const useCatalog = create<CatalogState>(() => ({
  lessons: [],
  status: "idle",
}));

function refreshEnglishLessons() {
  if (useCatalog.getState().status === "loading") return;
  useCatalog.setState({ status: "loading" });
  void fetchEnglishLessons().then(
    (lessons) => useCatalog.setState({ lessons, status: "ready" }),
    () => useCatalog.setState({ status: "error" }),
  );
}

export function useEnglishLessons() {
  const { lessons, status } = useCatalog();
  const today = beijingLessonDate(useNow());
  useFocusEffect(
    useCallback(() => {
      refreshEnglishLessons();
    }, []),
  );
  const available = useMemo(
    () => selectAvailableLessons(lessons, today),
    [lessons, today],
  );
  return { lessons: available, status, today, refresh: refreshEnglishLessons };
}
