import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  Locale,
  ReadingMode,
  VocabularyWord,
  ReviewRating,
  ReviewRecord,
  CustomSong,
} from "../domain/models";
import {
  createWord,
  normalizeWord,
  scheduleReview,
  localDateKey,
} from "../domain/vocabulary";

interface AppState {
  hydrated: boolean;
  locale: Locale;
  readingMode: ReadingMode;
  audioLocale: Locale;
  fontSize: number;
  bookId: string;
  chapter: number;
  selectedVerse: number;
  dailyGoal: number;
  words: VocabularyWord[];
  reviews: ReviewRecord[];
  bookmarks: string[];
  readChapters: Record<string, string[]>;
  songs: CustomSong[];
  toast: string | null;
  setHydrated: (value: boolean) => void;
  setLocale: (locale: Locale) => void;
  setReadingMode: (mode: ReadingMode) => void;
  setAudioLocale: (locale: Locale) => void;
  setFontSize: (size: number) => void;
  setChapter: (bookId: string, chapter: number, verse?: number) => void;
  setSelectedVerse: (verse: number) => void;
  setDailyGoal: (goal: number) => void;
  addWord: (
    word: string,
    meaning: string,
    reference: string,
    context: string,
  ) => boolean;
  removeWord: (id: string) => void;
  updateMeaning: (id: string, meaning: string) => void;
  reviewWord: (id: string, rating: ReviewRating) => void;
  toggleBookmark: (key: string) => void;
  markRead: () => void;
  addSong: (song: CustomSong) => void;
  removeSong: (id: string) => void;
  notify: (message: string | null) => void;
}
const seedWords = () => [
  createWord(
    "shepherd",
    "牧人；牧羊人",
    "Psalms 23:1",
    "The Lord is my shepherd, I lack nothing.",
  ),
  createWord(
    "righteousness",
    "公义；正直",
    "Psalms 23:3",
    "He guides me along the right paths for his name’s sake.",
  ),
  createWord(
    "grace",
    "恩典；优雅",
    "John 1:16",
    "Out of his fullness we have all received grace in place of grace already given.",
  ),
];
export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      hydrated: false,
      locale: "zh",
      readingMode: "parallel",
      audioLocale: "en",
      fontSize: 18,
      bookId: "psalms",
      chapter: 23,
      selectedVerse: 1,
      dailyGoal: 10,
      words: seedWords(),
      reviews: [],
      bookmarks: [],
      readChapters: {},
      songs: [],
      toast: null,
      setHydrated: (hydrated) => set({ hydrated }),
      setLocale: (locale) => set({ locale }),
      setReadingMode: (readingMode) => set({ readingMode }),
      setAudioLocale: (audioLocale) => set({ audioLocale }),
      setFontSize: (fontSize) => set({ fontSize }),
      setChapter: (bookId, chapter, verse = 1) =>
        set({ bookId, chapter, selectedVerse: verse }),
      setSelectedVerse: (selectedVerse) => set({ selectedVerse }),
      setDailyGoal: (dailyGoal) => set({ dailyGoal }),
      addWord: (word, meaning, reference, context) => {
        const normalized = normalizeWord(word);
        if (!normalized || get().words.some((w) => w.word === normalized))
          return false;
        set((s) => ({
          words: [
            createWord(normalized, meaning, reference, context),
            ...s.words,
          ],
        }));
        return true;
      },
      removeWord: (id) =>
        set((s) => ({ words: s.words.filter((w) => w.id !== id) })),
      updateMeaning: (id, meaning) =>
        set((s) => ({
          words: s.words.map((w) => (w.id === id ? { ...w, meaning } : w)),
        })),
      reviewWord: (id, rating) =>
        set((s) => ({
          words: s.words.map((w) =>
            w.id === id ? scheduleReview(w, rating) : w,
          ),
          reviews: [
            ...s.reviews,
            { wordId: id, rating, at: new Date().toISOString() },
          ].slice(-5000),
        })),
      toggleBookmark: (key) =>
        set((s) => ({
          bookmarks: s.bookmarks.includes(key)
            ? s.bookmarks.filter((k) => k !== key)
            : [...s.bookmarks, key],
        })),
      markRead: () =>
        set((s) => {
          const key = localDateKey();
          const chapter = `${s.bookId}:${s.chapter}`;
          return {
            readChapters: {
              ...s.readChapters,
              [key]: [...new Set([...(s.readChapters[key] ?? []), chapter])],
            },
          };
        }),
      addSong: (song) => set((s) => ({ songs: [...s.songs, song] })),
      removeSong: (id) =>
        set((s) => ({ songs: s.songs.filter((t) => t.id !== id) })),
      notify: (toast) => set({ toast }),
    }),
    {
      name: "selah-library-v1",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ hydrated, toast, ...state }) => state,
      onRehydrateStorage: () => (state, error) => {
        useAppStore.setState({ hydrated: true });
        if (error)
          useAppStore.setState({
            toast: "无法读取本地资料 / Could not load saved data.",
          });
      },
    },
  ),
);
