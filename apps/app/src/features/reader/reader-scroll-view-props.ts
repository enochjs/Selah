import type { Ref, ComponentRef } from "react";
import type { ScrollView, ScrollViewProps } from "react-native";

export interface ReaderScrollViewProps extends ScrollViewProps {
  ref?: Ref<ComponentRef<typeof ScrollView>>;
}
