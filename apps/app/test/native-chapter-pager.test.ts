import { beforeEach, expect, it, vi } from "vitest";
import {
  drawPager,
  nativeCommands,
  nativePager,
  nativeSlots,
  nativeState,
  pagerFixture,
  resetPager,
  selectNative,
  turnPage,
} from "./helpers/native-reader-pager";

beforeEach(() => {
  resetPager();
  vi.clearAllMocks();
});
it("prepares the current chapter and real neighbors before the first finger drag", () => {
  const { props } = pagerFixture();
  expect(props.renderPage).toHaveBeenCalledTimes(5);
  expect(props.renderPage).toHaveBeenCalledWith(
    { bookId: "genesis", chapter: 601 },
    true,
  );
  expect(props.renderPage).toHaveBeenCalledWith(
    { bookId: "genesis", chapter: 602 },
    false,
  );
  expect(nativeSlots()).toHaveLength(1189);
  expect(nativePager().offscreenPageLimit).toBe(1);
});
it("queues consecutive button turns natively and only commits the page actually selected", () => {
  const { props } = pagerFixture();
  selectNative(600);
  for (let n = 0; n < 20; n++) turnPage(1);
  for (let n = 0; n < 30; n++) turnPage(-1);
  expect(nativeCommands().animated).toHaveBeenCalledTimes(50);
  expect(nativeCommands().animated).toHaveBeenLastCalledWith(590);
  expect(props.onSelect).not.toHaveBeenCalled();
  selectNative(590);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 591,
  });
});
it("stops at both Bible boundaries without wrapping or saving a nonexistent chapter", () => {
  const { props } = pagerFixture(0, 3);
  turnPage(-1);
  expect(props.onBeforeChange).not.toHaveBeenCalled();
  turnPage(1);
  turnPage(1);
  turnPage(1);
  expect(nativeCommands().animated).toHaveBeenCalledTimes(2);
  selectNative(2);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 3,
  });
});
it("blocks native selection while a dialog is open and resets pending button turns before resuming", () => {
  const { props } = pagerFixture();
  selectNative(600);
  turnPage(1);
  drawPager({ ...props, enabled: false });
  expect(nativePager().scrollEnabled).toBe(false);
  selectNative(601);
  turnPage(1);
  expect(props.onSelect).not.toHaveBeenCalled();
  drawPager(props);
  turnPage(1);
  expect(nativeCommands().animated).toHaveBeenLastCalledWith(601);
  selectNative(601);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 602,
  });
});
it("deduplicates initial and repeated selected-page callbacks", () => {
  const { props } = pagerFixture();
  selectNative(600);
  selectNative(600);
  expect(props.onSelect).not.toHaveBeenCalled();
  nativeState("dragging");
  selectNative(601);
  selectNative(601);
  expect(props.onSelect).toHaveBeenCalledTimes(1);
});

it("retains the newest button target when an earlier native selection arrives between requests", () => {
  pagerFixture();
  selectNative(600);
  turnPage(1);
  turnPage(1);
  selectNative(601);
  turnPage(1);
  expect(nativeCommands().animated).toHaveBeenLastCalledWith(603);
});

it("accepts a button turn before the initial native selection callback", () => {
  const { props } = pagerFixture();
  turnPage(1);
  selectNative(601);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 602,
  });
});
