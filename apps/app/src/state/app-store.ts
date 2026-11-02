import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  defaultReadingFonts,
  restoreReadingFonts,
  type ReadingFonts,
} from "../domain/reading-fonts";
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
import {
  rememberReadingPosition,
  type ReadingPosition,
} from "../domain/reading";
import {
  addHymnReference,
  moveHymnReference,
  playlistName,
  restoreMusicLibrary,
  type HymnReference,
  type MusicPlaylist,
} from "../domain/music-library";

interface AppState {
  hydrated: boolean;
  locale: Locale;
  primaryLocale: Locale;
  showTranslation: boolean;
  fontSize: number;
  lineHeight: number;
  readingFonts: ReadingFonts;
  bookId: string;
  chapter: number;
  selectedVerse: number;
  readerChromeHidden: boolean;
  readingPosition: ReadingPosition;
  readingRequest: ReadingPosition | null;
  followingNarration: boolean;
  recentReadings: ReadingPosition[];
  dailyGoal: number;
  words: VocabularyWord[];
  reviews: ReviewRecord[];
  bookmarks: string[];
  readChapters: Record<string, string[]>;
  songs: CustomSong[];
  favoriteHymns: HymnReference[];
  musicPlaylists: MusicPlaylist[];
  toast: string | null;
  setHydrated: (value: boolean) => void;
  setLocale: (locale: Locale) => void;
  setPrimaryLocale: (locale: Locale) => void;
  setShowTranslation: (show: boolean) => void;
  setFontSize: (size: number) => void;
  setLineHeight: (height: number) => void;
  setReadingFont: <K extends Locale>(
    language: K,
    font: ReadingFonts[K],
  ) => void;
  setChapter: (bookId: string, chapter: number, verse?: number) => void;
  openReadingPosition: (
    position: ReadingPosition,
    options?: { selectVerse?: boolean },
  ) => void;
  followNarration: (bookId: string, chapter: number, verse: number) => void;
  setFollowingNarration: (following: boolean) => void;
  setSelectedVerse: (verse: number) => void;
  setReaderChromeHidden: (hidden: boolean) => void;
  saveReadingPosition: (position: ReadingPosition) => void;
  resumeReading: () => void;
  setDailyGoal: (goal: number) => void;
  addWord: (
    word: string,
    meaning: string,
    reference: string,
    context: string,
    note?: string,
  ) => boolean;
  removeWord: (id: string) => void;
  updateMeaning: (id: string, meaning: string) => void;
  updateWordDetails: (id: string, meaning: string, note: string) => void;
  reviewWord: (id: string, rating: ReviewRating) => void;
  toggleBookmark: (key: string) => void;
  addSong: (song: CustomSong) => void;
  removeSong: (id: string) => void;
  toggleFavoriteHymn: (hymn: HymnReference) => void;
  createMusicPlaylist: (name: string) => string | null;
  renameMusicPlaylist: (id: string, name: string) => boolean;
  deleteMusicPlaylist: (id: string) => void;
  addPlaylistHymn: (id: string, hymn: HymnReference) => void;
  removePlaylistHymn: (id: string, hymnId: string) => void;
  movePlaylistHymn: (id: string, hymnId: string, direction: -1 | 1) => void;
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
      primaryLocale: "en",
      showTranslation: true,
      fontSize: 18,
      lineHeight: 1.6,
      readingFonts: defaultReadingFonts,
      bookId: "psalms",
      chapter: 23,
      selectedVerse: 1,
      readerChromeHidden: false,
      readingPosition: { bookId: "psalms", chapter: 23, verse: 1, offset: 0 },
      readingRequest: null,
      followingNarration: false,
      recentReadings: [],
      dailyGoal: 10,
      words: seedWords(),
      reviews: [],
      bookmarks: [],
      readChapters: {},
      songs: [],
      favoriteHymns: [],
      musicPlaylists: [],
      toast: null,
      setHydrated: (hydrated) => set({ hydrated }),
      setLocale: (locale) => set({ locale }),
      setPrimaryLocale: (primaryLocale) => set({ primaryLocale }),
      setShowTranslation: (showTranslation) => set({ showTranslation }),
      setFontSize: (fontSize) => set({ fontSize }),
      setLineHeight: (lineHeight) => set({ lineHeight }),
      setReadingFont: (language, font) =>
        set((state) => ({
          readingFonts: restoreReadingFonts({
            ...state.readingFonts,
            [language]: font,
          }),
        })),
      setChapter: (bookId, chapter, verse = 1) =>
        get().openReadingPosition({ bookId, chapter, verse, offset: 0 }),
      openReadingPosition: (position, options) =>
        set((state) => {
          const previous =
            state.readingPosition.bookId === state.bookId &&
            state.readingPosition.chapter === state.chapter
              ? state.readingPosition
              : {
                  bookId: state.bookId,
                  chapter: state.chapter,
                  verse: Math.max(1, state.selectedVerse),
                  offset: 0,
                };
          return {
            bookId: position.bookId,
            chapter: position.chapter,
            selectedVerse: options?.selectVerse === false ? 0 : position.verse,
            readingRequest: { ...position },
            followingNarration: false,
            recentReadings: rememberReadingPosition(
              rememberReadingPosition(state.recentReadings, previous),
              position,
            ),
          };
        }),
      followNarration: (bookId, chapter, verse) => {
        get().openReadingPosition({ bookId, chapter, verse, offset: 0 });
        set({ followingNarration: true });
      },
      setFollowingNarration: (followingNarration) =>
        set({ followingNarration }),
      setSelectedVerse: (selectedVerse) => set({ selectedVerse }),
      setReaderChromeHidden: (readerChromeHidden) =>
        set({ readerChromeHidden }),
      saveReadingPosition: (readingPosition) =>
        set((state) => ({
          readingPosition,
          recentReadings: rememberReadingPosition(
            state.recentReadings,
            readingPosition,
          ),
        })),
      resumeReading: () => {
        get().openReadingPosition(get().readingPosition);
      },
      setDailyGoal: (dailyGoal) => set({ dailyGoal }),
      addWord: (word, meaning, reference, context, note = "") => {
        const normalized = normalizeWord(word);
        if (!normalized || get().words.some((w) => w.word === normalized))
          return false;
        set((s) => ({
          words: [
            {
              ...createWord(normalized, meaning, reference, context),
              note: note.trim(),
            },
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
      updateWordDetails: (id, meaning, note) =>
        set((s) => ({
          words: s.words.map((word) =>
            word.id === id
              ? { ...word, meaning: meaning.trim(), note: note.trim() }
              : word,
          ),
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
      toggleFavoriteHymn: (hymn) =>
        set((s) => ({
          favoriteHymns: s.favoriteHymns.some((item) => item.id === hymn.id)
            ? s.favoriteHymns.filter((item) => item.id !== hymn.id)
            : addHymnReference(s.favoriteHymns, hymn),
        })),
      createMusicPlaylist: (value) => {
        const name = playlistName(value);
        if (!name) return null;
        const id = `playlist-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        set((s) => ({
          musicPlaylists: [...s.musicPlaylists, { id, name, hymns: [] }],
        }));
        return id;
      },
      renameMusicPlaylist: (id, value) => {
        const name = playlistName(value);
        if (!name || !get().musicPlaylists.some((p) => p.id === id))
          return false;
        set((s) => ({
          musicPlaylists: s.musicPlaylists.map((p) =>
            p.id === id ? { ...p, name } : p,
          ),
        }));
        return true;
      },
      deleteMusicPlaylist: (id) =>
        set((s) => ({
          musicPlaylists: s.musicPlaylists.filter((p) => p.id !== id),
        })),
      addPlaylistHymn: (id, hymn) =>
        set((s) => ({
          musicPlaylists: s.musicPlaylists.map((p) =>
            p.id === id ? { ...p, hymns: addHymnReference(p.hymns, hymn) } : p,
          ),
        })),
      removePlaylistHymn: (id, hymnId) =>
        set((s) => ({
          musicPlaylists: s.musicPlaylists.map((p) =>
            p.id === id
              ? { ...p, hymns: p.hymns.filter((hymn) => hymn.id !== hymnId) }
              : p,
          ),
        })),
      movePlaylistHymn: (id, hymnId, direction) =>
        set((s) => ({
          musicPlaylists: s.musicPlaylists.map((p) =>
            p.id === id
              ? { ...p, hymns: moveHymnReference(p.hymns, hymnId, direction) }
              : p,
          ),
        })),
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
        readerChromeHidden,
        ...state
      }) => state,
      merge: (persisted, current) => {
        const { readingMode, audioLocale, ...saved } = (persisted ??
          {}) as Partial<AppState> & {
          readingMode?: ReadingMode;
          audioLocale?: Locale;
        };
        const readingPosition = saved.readingPosition ?? {
          bookId: saved.bookId ?? current.bookId,
          chapter: saved.chapter ?? current.chapter,
          verse: Math.max(1, saved.selectedVerse ?? current.selectedVerse),
          offset: 0,
        };
        return {
          ...current,
          ...saved,
          ...restoreMusicLibrary(saved.favoriteHymns, saved.musicPlaylists),
          readingFonts: restoreReadingFonts(saved.readingFonts),
          primaryLocale:
            saved.primaryLocale ??
            (readingMode === "en" || readingMode === "zh"
              ? readingMode
              : (audioLocale ?? current.primaryLocale)),
          showTranslation:
            saved.showTranslation ??
            (readingMode
              ? readingMode === "parallel"
              : current.showTranslation),
          readingRequest: null,
          followingNarration: false,
          readerChromeHidden: false,
          readingPosition,
          recentReadings: saved.recentReadings?.slice(0, 6) ?? [
            readingPosition,
          ],
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
