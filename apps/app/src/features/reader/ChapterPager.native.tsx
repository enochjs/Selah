import React, {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, View } from "react-native";
import PagerView from "react-native-pager-view";
import { ChapterPagination } from "./chapter-pagination";
import type { ChapterPagerProps } from "./chapter-pager-props";

export function ChapterPager({
  pages,
  index,
  enabled,
  onBeforeChange,
  onSelect,
  renderPage,
  ref,
}: ChapterPagerProps) {
  const pagerRef = useRef<PagerView>(null);
  const [model] = useState(() => new ChapterPagination(pages, index));
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
  useLayoutEffect(() => {
    if (model.jump(index)) pagerRef.current?.setPageWithoutAnimation(index);
  }, [index, model]);
  useImperativeHandle(
    ref,
    () => ({
      turn: (direction) => {
        const target = model.index + direction;
        if (!enabled || !model.request(target)) return;
        onBeforeChange();
        if (reducedMotion.current)
          pagerRef.current?.setPageWithoutAnimation(target);
        else pagerRef.current?.setPage(target);
      },
    }),
    [enabled, model, onBeforeChange],
  );
  return (
    <PagerView
      ref={pagerRef}
      style={{ flex: 1 }}
      initialPage={index}
      scrollEnabled={enabled}
      offscreenPageLimit={1}
      overdrag={false}
      overScrollMode="never"
      layoutDirection="ltr"
      onPageScrollStateChanged={(event) => {
        if (event.nativeEvent.pageScrollState === "dragging") onBeforeChange();
      }}
      onPageSelected={(event) => {
        const target = model.select(event.nativeEvent.position);
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
          style={{ flex: 1 }}
        >
          {Math.abs(position - index) <= 1 &&
            renderPage(page, position === index)}
        </View>
      ))}
    </PagerView>
  );
}
