import { beforeEach, expect, it, vi } from "vitest";
import {
  drawPager,
  nativeCommands,
  nativePager,
  nativeSlots,
  nativeState,
  pagerFixture,
  resetPager,
  scrollNative,
  selectNative,
  turnPage,
} from "./helpers/native-reader-pager";

beforeEach(() => {
  resetPager();
  vi.clearAllMocks();
});
it("keeps global native page identities and geometry fixed throughout dragging, settling and cache maintenance", () => {
  const { props } = pagerFixture();
  expect(nativePager().initialPage).toBe(600);
  expect(nativePager().scrollEnabled).toBe(true);
  const slots = nativeSlots();
  expect(slots).toHaveLength(1189);
  nativeState("dragging");
  scrollNative(600, 0.45);
  expect(props.onSelect).not.toHaveBeenCalled();
  nativeState("settling");
  scrollNative(600, 0.95);
  expect(props.onSelect).not.toHaveBeenCalled();
  selectNative(601);
  drawPager({ ...props, index: 601 });
  nativeState("idle");
  drawPager({ ...props, index: 601 });
  expect(nativeSlots()).toEqual(slots);
  expect(nativeCommands().immediate).not.toHaveBeenCalled();
  expect(nativeCommands().animated).not.toHaveBeenCalled();
});
it("does not change reading state for a native drag that returns to the original page", () => {
  const { props } = pagerFixture();
  selectNative(600);
  nativeState("dragging");
  scrollNative(600, 0.1);
  nativeState("settling");
  selectNative(600);
  nativeState("idle");
  expect(props.onSelect).not.toHaveBeenCalled();
});
it("accepts consecutive native gestures without waiting for an idle callback or a JS animation", () => {
  const { props } = pagerFixture();
  selectNative(600);
  for (let index = 601; index <= 620; index++) {
    nativeState("dragging");
    selectNative(index);
  }
  for (let index = 619; index >= 590; index--) {
    nativeState("dragging");
    selectNative(index);
  }
  expect(props.onSelect).toHaveBeenCalledTimes(50);
  expect(props.onSelect).toHaveBeenLastCalledWith({
    bookId: "genesis",
    chapter: 591,
  });
});

it("bounds prepared chapter text during interrupted flings that do not emit idle", () => {
  const { props } = pagerFixture();
  selectNative(600);
  for (let position = 601; position < 650; position++) {
    scrollNative(position, 0.6);
    vi.mocked(props.renderPage).mockClear();
    drawPager(props);
    expect(props.renderPage).toHaveBeenCalledWith(
      { bookId: "genesis", chapter: position + 2 },
      false,
    );
    expect(vi.mocked(props.renderPage).mock.calls.length).toBeLessThanOrEqual(
      6,
    );
  }
});
