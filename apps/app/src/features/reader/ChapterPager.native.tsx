import React, { useEffect, useImperativeHandle, useRef, useState } from "react";
import { AccessibilityInfo, View } from "react-native";
import PagerView from "react-native-pager-view";
import { ChapterPagination } from "./chapter-pagination";
import type { ChapterPagerProps } from "./chapter-pager-props";
import {
  chapterBuffer,
  growChapterBuffer,
  chapterPreloadRadius,
} from "./chapter-buffer";

export const ChapterPager = React.memo(function ChapterPager(
  props: ChapterPagerProps,
) {
  const [model] = useState(
    () => new ChapterPagination(props.pages, props.index),
  );
  const [generation, setGeneration] = useState(0);
  if (props.index !== model.index) {
    // An explicit search/book-picker jump starts a new native event stream.
    // Native swipe selections already update model.index before the store.
    model.jump(props.index);
    setGeneration(generation + 1);
  }
  return (
    <NativeChapterPager
      key={generation}
      {...props}
      model={model}
      isCurrentStream={model.captureEventStream()}
    />
  );
});

function NativeChapterPager({
  pages,
  index,
  enabled,
  onBeforeChange,
  onSelect,
  renderPage,
  ref,
  model,
  isCurrentStream,
}: ChapterPagerProps & {
  model: ChapterPagination;
  isCurrentStream: () => boolean;
}) {
  const pagerRef = useRef<PagerView>(null);
  const [buffer, setBuffer] = useState(() =>
    chapterBuffer(pages.length, index),
  );
  const [preloadReady, setPreloadReady] = useState(false);
  useEffect(() => {
    const task = requestIdleCallback(() => setPreloadReady(true), {
      timeout: 1000,
    });
    return () => cancelIdleCallback(task);
  }, []);
  const visiblePage = useRef(index);
  const reducedMotion = useRef(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) reducedMotion.current = value;
      })
      .catch(() => {
        /* Keep immediate navigation when the preference is unavailable. */
      });
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reducedMotion.current = value;
      },
    );
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      turn: (direction) => {
        if (!isCurrentStream()) return;
        const target = model.index + direction;
        if (!enabled || !model.request(target)) return;
        setPreloadReady(true);
        onBeforeChange();
        if (reducedMotion.current)
          pagerRef.current?.setPageWithoutAnimation(target);
        else pagerRef.current?.setPage(target);
      },
    }),
    [enabled, model, onBeforeChange, isCurrentStream],
  );
  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={index}
      scrollEnabled={enabled}
      offscreenPageLimit={chapterPreloadRadius}
      overdrag={false}
      overScrollMode="never"
      layoutDirection="ltr"
      onPageScroll={(event) => {
        if (!isCurrentStream()) return;
        const { position, offset } = event.nativeEvent;
        if (offset > 0 || position !== index) setPreloadReady(true);
        visiblePage.current = Math.round(position + offset);
        setBuffer((current) =>
          growChapterBuffer(current, pages.length, position, offset),
        );
      }}
      onPageScrollStateChanged={(event) => {
        if (!isCurrentStream()) return;
        if (event.nativeEvent.pageScrollState === "dragging") {
          setPreloadReady(true);
          model.beginDrag();
          onBeforeChange();
        } else if (event.nativeEvent.pageScrollState === "idle") {
          // Reclaim text only. Native chapter positions never move or lock.
          const settled = chapterBuffer(pages.length, visiblePage.current);
          setBuffer((current) =>
            current.first === settled.first && current.last === settled.last
              ? current
              : settled,
          );
        }
      }}
      onPageSelected={(event) => {
        if (!isCurrentStream()) return;
        const selected = event.nativeEvent.position;
        visiblePage.current = selected;
        setBuffer((current) =>
          growChapterBuffer(current, pages.length, selected, 0),
        );
        const target = model.select(selected);
        if (target) {
          onBeforeChange();
          onSelect(target);
        }
      }}
    >
      {pages.map((page, position) => (
        <View
          key={`${page.bookId}:${page.chapter}`}
          collapsable={false}
          style={{ width: "100%", height: "100%" }}
        >
          {(position === index ||
            (preloadReady &&
              ((position >= buffer.first && position <= buffer.last) ||
                Math.abs(position - index) <= chapterPreloadRadius))) &&
            renderPage(page, position === index)}
        </View>
      ))}
    </PagerView>
  );
}
