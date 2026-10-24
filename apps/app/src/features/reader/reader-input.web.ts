import { useEffect } from "react";

export function hasTextSelection() {
  return !!window.getSelection()?.toString();
}

export function useChapterKeyboard(
  enabled: boolean,
  changeChapter: (direction: -1 | 1) => void,
) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        hasTextSelection() ||
        document.querySelector('[role="dialog"], [aria-modal="true"]') ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select, button, [role=button]")))
      )
        return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault();
        changeChapter(event.key === "ArrowLeft" ? -1 : 1);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled, changeChapter]);
}
