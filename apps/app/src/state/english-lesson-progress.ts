import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  lessonCheckpoint,
  type EnglishLesson,
  type LessonProgress,
} from "../domain/english-lessons";

interface EnglishProgressState {
  progress: Record<string, LessonProgress>;
  hydrated: boolean;
  finishHydration: () => void;
  save: (
    lesson: Pick<EnglishLesson, "id" | "sha256" | "duration">,
    time: number,
    finished?: boolean,
  ) => void;
}

export const useEnglishProgress = create<EnglishProgressState>()(
  persist(
    (set) => ({
      progress: {},
      hydrated: false,
      finishHydration: () => set({ hydrated: true }),
      save: (lesson, time, finished = false) => {
        if (!Number.isFinite(time)) return;
        set((state) => {
          const previous = state.progress[lesson.id];
          const next = lessonCheckpoint(
            previous,
            lesson.sha256,
            time,
            lesson.duration,
            finished,
          );
          if (
            next.revision === previous?.revision &&
            next.time === previous.time &&
            next.completed === previous.completed
          ) {
            return state;
          }
          return { progress: { ...state.progress, [lesson.id]: next } };
        });
      },
    }),
    {
      name: "selah-english-progress-v1",
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ progress }) => ({ progress }),
      onRehydrateStorage: (state) => () => state.finishHydration(),
    },
  ),
);
