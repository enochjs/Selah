import React from "react";
import { ScrollView } from "react-native";
import type { LyricScrollViewProps } from "./LyricScrollView";

export function LyricScrollView({
  scrollRef,
  onBrowse,
  ...props
}: LyricScrollViewProps) {
  return (
    <div
      style={{ display: "flex", flex: 1, minHeight: 0 }}
      onWheel={onBrowse}
      onTouchStart={onBrowse}
      onPointerDown={onBrowse}
      onKeyDown={(event) => {
        if (
          [
            "ArrowUp",
            "ArrowDown",
            "PageUp",
            "PageDown",
            "Home",
            "End",
          ].includes(event.key)
        )
          onBrowse();
      }}
    >
      <ScrollView {...props} ref={scrollRef} />
    </div>
  );
}
