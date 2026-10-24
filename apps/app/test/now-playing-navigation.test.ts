import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { AudioTrack } from "../src/domain/models";
import { narrationVerseToFollow } from "../src/domain/reading";
import { useAppStore } from "../src/state/app-store";
import { NowPlayingButton } from "../src/features/audio/NowPlayingButton";

const playback = vi.hoisted(() => ({
  track: null as AudioTrack | null,
  playing: true,
  locate: undefined as (() => void) | undefined,
  push: vi.fn(),
}));
vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async () => null,
    setItem: async () => {},
    removeItem: async () => {},
  },
}));
vi.mock("expo-router", () => ({ router: { push: playback.push } }));
vi.mock("lucide-react-native", () => ({
  AudioLines: () => null,
  Headphones: () => null,
}));
vi.mock("../src/shared/ui", () => ({ IconButton: () => null }));
vi.mock("../src/shared/i18n", () => ({
  useI18n: () => ({ bi: (zh: string) => zh }),
}));
vi.mock("../src/features/audio/AudioProvider", () => ({
  useAudio: () => playback,
}));
vi.mock("../src/features/audio/AudioControlsDialog", () => ({
  AudioControlsDialog: ({ onLocate }: { onLocate: () => void }) => {
    playback.locate = onLocate;
    return null;
  },
}));

const track: AudioTrack = {
  id: "psalms-23-2-en",
  kind: "scripture",
  title: "Psalms 23:2",
  subtitle: "",
  source: { uri: "https://example.com/psalms-23.mp3" },
  artwork: 1,
  bookId: "psalms",
  chapter: 23,
  verse: 2,
  locale: "en",
};

beforeEach(() => {
  useAppStore.setState(useAppStore.getInitialState());
  playback.track = track;
  playback.playing = true;
  playback.locate = undefined;
  playback.push.mockClear();
});

function locatePlayingContent() {
  renderToStaticMarkup(React.createElement(NowPlayingButton));
  expect(playback.locate).toBeTypeOf("function");
  playback.locate!();
}

function verseToFollow(verse: number, foreground = true) {
  const state = useAppStore.getState();
  return narrationVerseToFollow(
    { ...track, verse },
    {
      bookId: state.bookId,
      chapter: state.chapter,
      following: state.followingNarration,
      foreground,
      playing: playback.playing,
    },
  );
}

it("follows subsequent verses after locating the playing passage", () => {
  const saved = { bookId: "john", chapter: 1, verse: 12, offset: 32 };
  useAppStore.getState().saveReadingPosition(saved);
  locatePlayingContent();
  expect(playback.push).toHaveBeenCalledWith("/bible");
  expect(useAppStore.getState()).toMatchObject({
    bookId: "psalms",
    chapter: 23,
    selectedVerse: 2,
    readingPosition: saved,
  });
  // The restoration request is consumed once the reader has laid out its rows.
  useAppStore.setState({ readingRequest: null });
  expect(verseToFollow(3)).toBe(3);
  expect(verseToFollow(4)).toBe(4);
  expect(verseToFollow(5, false)).toBeNull();
});

it("keeps following intent when locating paused audio and follows after resuming", () => {
  playback.playing = false;
  locatePlayingContent();
  expect(verseToFollow(2)).toBeNull();
  playback.playing = true;
  expect(verseToFollow(3)).toBe(3);
});

it("stops following when resuming reading or explicitly navigating, including the same chapter", () => {
  locatePlayingContent();
  useAppStore.getState().resumeReading();
  expect(verseToFollow(3)).toBeNull();
  locatePlayingContent();
  useAppStore.getState().setChapter("psalms", 23, 1);
  expect(verseToFollow(3)).toBeNull();
});

it("does not persist following intent or restore it from saved library data", () => {
  locatePlayingContent();
  const options = useAppStore.persist.getOptions();
  const saved = options.partialize!(useAppStore.getState());
  expect(saved).not.toHaveProperty("followingNarration");
  const restored = options.merge!(
    { followingNarration: true },
    useAppStore.getInitialState(),
  );
  expect(restored.followingNarration).toBe(false);
});
