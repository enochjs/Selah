import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  AppState,
  type ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { useFocusEffect } from "expo-router";
import type { VerseLayout } from "../../domain/reading";
import { ReadingViewport } from "./reading-viewport";
import { useAppStore } from "../../state/app-store";

export function useReadingProgress(
  bookId: string,
  chapter: number,
  scrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>,
  topInset = 0,
) {
  const request = useAppStore((s) =>
    s.readingRequest?.bookId === bookId && s.readingRequest.chapter === chapter
      ? s.readingRequest
      : null,
  );
  const focused = useRef(false);
  const active = useRef(AppState.currentState === "active");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCurrentChapter = useCallback(() => {
    const state = useAppStore.getState();
    return state.bookId === bookId && state.chapter === chapter;
  }, [bookId, chapter]);
  const [viewport] = useState(() => {
    const state = useAppStore.getState();
    const position = state.readingRequest ?? state.readingPosition;
    return new ReadingViewport(
      position.bookId === bookId && position.chapter === chapter
        ? position
        : {
            bookId,
            chapter,
            verse: isCurrentChapter() ? Math.max(1, state.selectedVerse) : 1,
            offset: 0,
          },
      topInset,
    );
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!focused.current || !active.current || !isCurrentChapter()) return;
    const position = viewport.position();
    if (!position) return;
    const previous = useAppStore.getState().readingPosition;
    if (
      position.bookId !== previous.bookId ||
      position.chapter !== previous.chapter ||
      position.verse !== previous.verse ||
      Math.abs(position.offset - previous.offset) > 1
    )
      useAppStore.getState().saveReadingPosition(position);
  }, [viewport, isCurrentChapter]);

  const applyRestoration = useCallback(
    (y: number | null) => {
      if (y === null) return;
      scrollRef.current?.scrollTo({ y, animated: false });
      if (useAppStore.getState().readingRequest === viewport.restoredTarget)
        useAppStore.setState({ readingRequest: null });
      flush();
    },
    [scrollRef, viewport, flush],
  );

  useLayoutEffect(() => {
    applyRestoration(viewport.setTopInset(topInset));
  }, [topInset, viewport, applyRestoration]);

  useEffect(() => {
    if (request?.bookId === bookId && request.chapter === chapter)
      applyRestoration(viewport.request(request));
  }, [request, bookId, chapter, viewport, applyRestoration]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        flush();
        focused.current = false;
      };
    }, [flush]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") flush();
      active.current = state === "active";
    });
    return () => {
      subscription.remove();
      if (timer.current) clearTimeout(timer.current);
    };
  }, [flush]);

  const isForeground = useCallback(
    () => focused.current && active.current && isCurrentChapter(),
    [isCurrentChapter],
  );
  const scrollToVerse = useCallback(
    (number: number) => {
      const y = viewport.verseY(number);
      if (y !== undefined)
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - topInset - 20),
          animated: true,
        });
    },
    [scrollRef, viewport, topInset],
  );

  const registerVerse = useCallback(
    (row: VerseLayout) => applyRestoration(viewport.layoutVerse(row)),
    [applyRestoration, viewport],
  );
  const preservePosition = useCallback(
    () => applyRestoration(viewport.preservePosition()),
    [applyRestoration, viewport],
  );
  return {
    registerVerse,
    scrollToVerse,
    onLayout: (height: number) =>
      applyRestoration(viewport.layoutViewport(height)),
    onContentSizeChange: (_width: number, height: number) =>
      applyRestoration(viewport.layoutContent(height)),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!focused.current || !active.current || !isCurrentChapter()) return;
      viewport.scrolled(event.nativeEvent.contentOffset.y);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 180);
    },
    flush,
    preservePosition,
    isForeground,
  };
}
