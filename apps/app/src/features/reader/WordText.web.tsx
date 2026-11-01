import React, { useEffect, useRef } from "react";
import { colors as c } from "../../shared/theme";
import { useI18n } from "../../shared/i18n";
import type { WordTextProps } from "./WordText";

// RN Web Text supports clicks but not native Text's onLongPress. Keep inline
// wrapping while distinguishing a stationary hold from tapping or scrolling.
export function WordText({
  text,
  known,
  interactive,
  onSelect,
  onLookup,
}: WordTextProps) {
  const { bi } = useI18n();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const gesture = useRef<{
    x: number;
    y: number;
    cancelled: boolean;
    held: boolean;
  } | null>(null);
  const clearTimer = () => {
    if (timer.current !== null) clearTimeout(timer.current);
    timer.current = null;
  };
  const cancel = () => {
    clearTimer();
    if (gesture.current) gesture.current.cancelled = true;
  };
  useEffect(() => {
    if (!interactive && gesture.current) gesture.current.cancelled = true;
    return () => {
      if (timer.current !== null) clearTimeout(timer.current);
    };
  }, [interactive]);
  return (
    <span
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      title={
        interactive ? bi("长按查词", "Hold to look up this word") : undefined
      }
      style={{
        userSelect: interactive ? "none" : undefined,
        ...(known
          ? {
              color: c.green,
              textDecorationLine: "underline",
              textDecorationColor: "#B8C5A8",
            }
          : {}),
      }}
      onPointerDown={
        interactive
          ? (event) => {
              if (event.button !== 0 || !event.isPrimary) return;
              event.stopPropagation();
              clearTimer();
              const current = {
                x: event.clientX,
                y: event.clientY,
                cancelled: false,
                held: false,
              };
              gesture.current = current;
              timer.current = setTimeout(() => {
                timer.current = null;
                current.held = true;
                onLookup();
              }, 500);
            }
          : undefined
      }
      onPointerMove={
        interactive
          ? (event) => {
              const current = gesture.current;
              if (
                current &&
                Math.hypot(
                  event.clientX - current.x,
                  event.clientY - current.y,
                ) > 10
              )
                cancel();
            }
          : undefined
      }
      onPointerUp={interactive ? clearTimer : undefined}
      onPointerCancel={interactive ? cancel : undefined}
      onPointerLeave={interactive ? cancel : undefined}
      onWheel={interactive ? cancel : undefined}
      onBlur={interactive ? cancel : undefined}
      onMouseDown={interactive ? (event) => event.stopPropagation() : undefined}
      onTouchStart={
        interactive ? (event) => event.stopPropagation() : undefined
      }
      onContextMenu={
        interactive
          ? (event) => {
              event.preventDefault();
              event.stopPropagation();
            }
          : undefined
      }
      onClick={
        interactive
          ? (event) => {
              event.stopPropagation();
              clearTimer();
              const current = gesture.current;
              if (
                !current?.held &&
                !current?.cancelled &&
                !window.getSelection()?.toString()
              )
                onSelect?.();
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                if (!event.repeat) onLookup();
              }
            }
          : undefined
      }
    >
      {text}
    </span>
  );
}
