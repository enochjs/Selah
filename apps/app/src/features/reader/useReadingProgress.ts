import { useCallback, useEffect, useRef, useState } from "react";
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
) {
  const request = useAppStore((s) => s.readingRequest);
  const focused = useRef(false);
  const active = useRef(AppState.currentState === "active");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [viewport] = useState(() => {
    const state = useAppStore.getState();
    const position = state.readingRequest ?? state.readingPosition;
    return new ReadingViewport(
      position.bookId === bookId && position.chapter === chapter
        ? position
        : { bookId, chapter, verse: state.selectedVerse, offset: 0 },
    );
  });

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (!focused.current || !active.current) return;
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
  }, [viewport]);

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

  const isForeground = useCallback(() => focused.current && active.current, []);
  const scrollToVerse = useCallback(
    (number: number) => {
      const y = viewport.verseY(number);
      if (y !== undefined)
        scrollRef.current?.scrollTo({
          y: Math.max(0, y - 20),
          animated: true,
        });
    },
    [scrollRef, viewport],
  );

  return {
    registerVerse: (row: VerseLayout) =>
      applyRestoration(viewport.layoutVerse(row)),
    scrollToVerse,
    onLayout: (height: number) =>
      applyRestoration(viewport.layoutViewport(height)),
    onContentSizeChange: (_width: number, height: number) =>
      applyRestoration(viewport.layoutContent(height)),
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!focused.current || !active.current) return;
      viewport.scrolled(event.nativeEvent.contentOffset.y);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 180);
    },
    flush,
    isForeground,
  };
}
