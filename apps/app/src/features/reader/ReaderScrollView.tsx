import { ScrollView, type ViewStyle } from "react-native";
import type { ReaderScrollViewProps } from "./reader-scroll-view-props";

// ReadingViewport restores the verse and offset after text reflows.
const readingScrollStyle: ViewStyle & { overflowAnchor: "none" } = {
  overflowAnchor: "none",
};

export function ReaderScrollView(props: ReaderScrollViewProps) {
  return <ScrollView {...props} style={[props.style, readingScrollStyle]} />;
}
