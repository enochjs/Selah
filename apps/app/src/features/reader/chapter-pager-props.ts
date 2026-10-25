import type { ReactNode, Ref } from "react";
import type { ChapterPage } from "./chapter-pagination";

export interface ChapterPagerHandle {
  turn: (direction: -1 | 1) => void;
}

export interface ChapterPagerProps {
  pages: readonly ChapterPage[];
  index: number;
  enabled: boolean;
  onBeforeChange: () => void;
  onSelect: (page: ChapterPage) => void;
  renderPage: (page: ChapterPage, current: boolean) => ReactNode;
  ref?: Ref<ChapterPagerHandle>;
}
