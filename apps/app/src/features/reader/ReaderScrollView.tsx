import { ScrollView } from "react-native";
import type { ReaderScrollViewProps } from "./reader-scroll-view-props";

export function ReaderScrollView(props: ReaderScrollViewProps) {
  return <ScrollView {...props} />;
}
