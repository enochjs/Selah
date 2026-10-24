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
} from "../domain/vocabulary";
import type { ReadingPosition } from "../domain/reading";

interface AppState {
  hydrated: boolean;
  locale: Locale;
  readingMode: ReadingMode;
  audioLocale: Locale;
  fontSize: number;
  bookId: string;
  chapter: number;
  selectedVerse: number;
  readingPosition: ReadingPosition;
  readingRequest: ReadingPosition | null;
  followingNarration: boolean;
  chapterSwipeLearned: boolean;
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
  followNarration: (bookId: string, chapter: number, verse: number) => void;
  setFollowingNarration: (following: boolean) => void;
  setSelectedVerse: (verse: number) => void;
  saveReadingPosition: (position: ReadingPosition) => void;
  resumeReading: () => void;
  learnChapterSwipe: () => void;
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
      readingPosition: { bookId: "psalms", chapter: 23, verse: 1, offset: 0 },
      readingRequest: null,
      followingNarration: false,
      chapterSwipeLearned: false,
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
        set({
          bookId,
          chapter,
          selectedVerse: verse,
          readingRequest: { bookId, chapter, verse, offset: 0 },
          followingNarration: false,
        }),
      followNarration: (bookId, chapter, verse) =>
        set({
          bookId,
          chapter,
          selectedVerse: verse,
          readingRequest: { bookId, chapter, verse, offset: 0 },
          followingNarration: true,
        }),
      setFollowingNarration: (followingNarration) =>
        set({ followingNarration }),
      setSelectedVerse: (selectedVerse) => set({ selectedVerse }),
      saveReadingPosition: (readingPosition) => set({ readingPosition }),
      resumeReading: () => {
        const position = get().readingPosition;
        set({
          bookId: position.bookId,
          chapter: position.chapter,
          selectedVerse: position.verse,
          readingRequest: { ...position },
          followingNarration: false,
        });
      },
      learnChapterSwipe: () => set({ chapterSwipeLearned: true }),
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
      addSong: (song) => set((s) => ({ songs: [...s.songs, song] })),
      removeSong: (id) =>
        set((s) => ({ songs: s.songs.filter((t) => t.id !== id) })),
      notify: (toast) => set({ toast }),
    }),
    {
      name: "selah-library-v1",
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({
        hydrated,
        toast,
        readingRequest,
        followingNarration,
        ...state
      }) => state,
      merge: (persisted, current) => {
        const saved = persisted as Partial<AppState> | undefined;
        return {
          ...current,
          ...saved,
          readingRequest: null,
          followingNarration: false,
          readingPosition: saved?.readingPosition ?? {
            bookId: saved?.bookId ?? current.bookId,
            chapter: saved?.chapter ?? current.chapter,
            verse: saved?.selectedVerse ?? current.selectedVerse,
            offset: 0,
          },
        };
      },
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
