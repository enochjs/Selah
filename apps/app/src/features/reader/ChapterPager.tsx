import React, {
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { FlatList, View, useWindowDimensions } from "react-native";
import { ChapterPagination, type ChapterPage } from "./chapter-pagination";
import type { ChapterPagerProps } from "./chapter-pager-props";

/** Browsers use native scrolling and CSS scroll snapping, preserving text selection. */
export function ChapterPager({
  pages,
  index,
  enabled,
  onBeforeChange,
  onSelect,
  renderPage,
  ref,
}: ChapterPagerProps) {
  const { width: viewportWidth } = useWindowDimensions();
  const [width, setWidth] = useState(viewportWidth);
  const previousWidth = useRef(width);
  const listRef = useRef<FlatList<ChapterPage>>(null);
  const [model] = useState(() => new ChapterPagination(pages, index));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useLayoutEffect(() => {
    const resized = previousWidth.current !== width;
    previousWidth.current = width;
    if (model.jump(index) || resized)
      listRef.current?.scrollToIndex({ index, animated: false });
  }, [index, model, width]);
  useImperativeHandle(
    ref,
    () => ({
      turn: (direction) => {
        const target = model.index + direction;
        if (!enabled || !model.request(target)) return;
        onBeforeChange();
        const animated =
          typeof window !== "undefined" &&
          !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        listRef.current?.scrollToIndex({ index: target, animated });
      },
    }),
    [enabled, model, onBeforeChange],
  );
  return (
    <FlatList
      ref={listRef}
      horizontal
      pagingEnabled
      scrollEnabled={enabled}
      showsHorizontalScrollIndicator={false}
      initialScrollIndex={index}
      data={pages}
      extraData={index}
      initialNumToRender={1}
      windowSize={3}
      maxToRenderPerBatch={1}
      getItemLayout={(_, position) => ({
        length: width,
        offset: width * position,
        index: position,
      })}
      keyExtractor={(page) => `${page.bookId}:${page.chapter}`}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      onScrollBeginDrag={onBeforeChange}
      onTouchStart={() => model.beginDrag()}
      scrollEventThrottle={16}
      onScroll={(event) => {
        const x = event.nativeEvent.contentOffset.x;
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          const position = Math.round(x / width);
          if (Math.abs(x - position * width) > 1) return;
          const target = model.select(position);
          if (target) {
            onBeforeChange();
            onSelect(target);
          }
        }, 120);
      }}
      renderItem={({ item, index: position }) => (
        <View style={{ width, flex: 1 }}>
          {renderPage(item, position === index)}
        </View>
      )}
    />
  );
}
