import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { AccessibilityInfo, View } from "react-native";
import PagerView, { type PagerViewRef } from "react-native-pager-view";
import { ChapterPagination } from "./chapter-pagination";
import type { ChapterPagerProps } from "./chapter-pager-props";

const pageStyle = { width: "100%", height: "100%" } as const;
const textRadius = 2;

/** Native page identities never move when cached chapter text changes. */
export const ChapterPager = React.memo(function ChapterPager(
  props: ChapterPagerProps,
) {
  const [navigation, setNavigation] = useState(() => ({
    controlledIndex: props.index,
    model: new ChapterPagination(props.pages, props.index),
    generation: 0,
  }));
  if (props.index !== navigation.controlledIndex) {
    const externalJump = props.index !== navigation.model.index;
    // Only React state changes during render. Aborted work cannot invalidate
    // the currently mounted native view or mutate its navigation model.
    setNavigation({
      controlledIndex: props.index,
      model: externalJump
        ? new ChapterPagination(props.pages, props.index)
        : navigation.model,
      generation: navigation.generation + (externalJump ? 1 : 0),
    });
    return null;
  }
  const { model, generation } = navigation;
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
  const pager = useRef<PagerViewRef>(null);
  const mounted = useRef(true);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [cacheCenter, setCacheCenter] = useState(index);
  const cacheCenterNow = useRef(index);
  const visiblePage = useRef(index);
  const requestedPage = useRef(index);
  const requestPending = useRef(false);
  const prepared = useRef(false);
  const enabledNow = useRef(enabled);
  const reducedMotion = useRef(false);
  const warming = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prepareAround = useCallback((position: number) => {
    if (cacheCenterNow.current === position) return;
    cacheCenterNow.current = position;
    setCacheCenter(position);
  }, []);
  useLayoutEffect(() => {
    enabledNow.current = enabled;
    if (!enabled) {
      if (warming.current) clearTimeout(warming.current);
      prepareAround(model.index);
      requestedPage.current = model.index;
      requestPending.current = false;
      visiblePage.current = model.index;
      prepared.current = false;
      pager.current?.setPageWithoutAnimation(model.index);
    }
  }, [enabled, model, prepareAround]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) reducedMotion.current = value;
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      (value) => {
        reducedMotion.current = value;
      },
    );
    return () => {
      active = false;
      subscription.remove();
      if (warming.current) clearTimeout(warming.current);
    };
  }, []);
  useImperativeHandle(
    ref,
    () => ({
      turn: (direction) => {
        const target = requestedPage.current + direction;
        if (
          !mounted.current ||
          !enabledNow.current ||
          !isCurrentStream() ||
          !pages[target]
        )
          return;
        model.beginDrag();
        prepareAround(target);
        requestedPage.current = target;
        requestPending.current = true;
        if (!prepared.current) {
          onBeforeChange();
          prepared.current = true;
        }
        if (reducedMotion.current)
          pager.current?.setPageWithoutAnimation(target);
        else pager.current?.setPage(target);
      },
    }),
    [pages, model, prepareAround, isCurrentStream, onBeforeChange],
  );

  return (
    <PagerView
      ref={pager}
      style={{ flex: 1 }}
      initialPage={index}
      scrollEnabled={enabled}
      offscreenPageLimit={1}
      overScrollMode="never"
      overdrag={false}
      layoutDirection="ltr"
      onPageScroll={(event) => {
        if (!mounted.current || !isCurrentStream() || !enabledNow.current)
          return;
        const { position, offset } = event.nativeEvent;
        visiblePage.current = Math.round(position + offset);
        // Prepare necessary pages even if repeated drags interrupt every idle.
        if (
          Math.abs(visiblePage.current - cacheCenterNow.current) >= textRadius
        )
          prepareAround(visiblePage.current);
      }}
      onPageScrollStateChanged={(event) => {
        if (!mounted.current || !isCurrentStream() || !enabledNow.current)
          return;
        const state = event.nativeEvent.pageScrollState;
        if (state === "dragging") {
          if (warming.current) clearTimeout(warming.current);
          model.beginDrag();
          requestedPage.current = visiblePage.current;
          requestPending.current = false;
          if (!prepared.current) {
            onBeforeChange();
            prepared.current = true;
          }
        } else if (state === "idle") {
          prepared.current = false;
          if (warming.current) clearTimeout(warming.current);
          warming.current = setTimeout(() => {
            if (mounted.current && isCurrentStream() && enabledNow.current)
              prepareAround(visiblePage.current);
          }, 150);
        }
      }}
      onPageSelected={(event) => {
        if (!mounted.current || !isCurrentStream() || !enabledNow.current)
          return;
        const page = model.select(event.nativeEvent.position);
        visiblePage.current = model.index;
        if (!requestPending.current || model.index === requestedPage.current) {
          requestedPage.current = model.index;
          requestPending.current = false;
        }
        if (!page) return;
        if (!prepared.current) onBeforeChange();
        prepared.current = false;
        onSelect(page);
      }}
    >
      {pages.map((page, position) => (
        <View
          key={`${page.bookId}:${page.chapter}`}
          collapsable={false}
          style={pageStyle}
        >
          {(position === index ||
            Math.abs(position - cacheCenter) <= textRadius) &&
            renderPage(page, position === index)}
        </View>
      ))}
    </PagerView>
  );
}
