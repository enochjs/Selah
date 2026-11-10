import React from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

export interface LyricScrollViewProps extends ScrollViewProps {
  scrollRef: React.RefObject<React.ComponentRef<typeof ScrollView> | null>;
  onBrowse: () => void;
}

export function LyricScrollView({
  scrollRef,
  onBrowse,
  ...props
}: LyricScrollViewProps) {
  return <ScrollView {...props} ref={scrollRef} onScrollBeginDrag={onBrowse} />;
}
