import { beforeEach, expect, it, vi } from "vitest";
import {
  drawPager,
  nativeCommands,
  nativePager,
  nativeSlots,
  pagerFixture,
  resetPager,
  selectNative,
  turnPage,
} from "./helpers/native-reader-pager";
beforeEach(() => {
  resetPager();
  vi.clearAllMocks();
});
it("starts navigation at a search destination and rejects events from the old native stream", () => {
  const { props } = pagerFixture();
  selectNative(600);
  const oldSelected = nativePager().onPageSelected;
  drawPager({ ...props, index: 0 });
  expect(nativePager().initialPage).toBe(0);
  oldSelected?.({ nativeEvent: { position: 601 } } as Parameters<
    NonNullable<typeof oldSelected>
  >[0]);
  expect(props.onSelect).not.toHaveBeenCalled();
  selectNative(0);
  turnPage(1);
  expect(nativeCommands().animated).toHaveBeenLastCalledWith(1);
  selectNative(1);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 2,
  });
});
it("renders a distant jump directly without mounting intervening chapter text", () => {
  const { props } = pagerFixture();
  vi.mocked(props.renderPage).mockClear();
  const { html } = drawPager({ ...props, index: 0 });
  expect(html).toContain('data-current="true">1</article>');
  expect(html).not.toContain(">601</article>");
  expect(nativeSlots()).toHaveLength(1189);
  expect(props.onSelect).not.toHaveBeenCalled();
});
it("crosses book boundaries using the stable global native chapter mapping", () => {
  const pages = [
    { bookId: "genesis", chapter: 1 },
    { bookId: "genesis", chapter: 2 },
    { bookId: "exodus", chapter: 1 },
    { bookId: "exodus", chapter: 2 },
  ];
  const { props } = pagerFixture(1, 4, pages);
  selectNative(1);
  selectNative(2);
  selectNative(1);
  expect(props.onSelect).toHaveBeenNthCalledWith(1, pages[2]);
  expect(props.onSelect).toHaveBeenNthCalledWith(2, pages[1]);
});

it("keeps the committed native stream valid when a chapter render is abandoned", () => {
  const { props } = pagerFixture();
  selectNative(600);
  const committed = nativePager().onPageSelected!;
  expect(() =>
    drawPager({
      ...props,
      index: 602,
      renderPage: () => {
        throw new Error("abandoned render");
      },
    }),
  ).toThrow("abandoned render");
  committed({ nativeEvent: { position: 601 } } as Parameters<
    typeof committed
  >[0]);
  expect(props.onSelect).toHaveBeenCalledExactlyOnceWith({
    bookId: "genesis",
    chapter: 602,
  });
});
it("keeps accepting native pages while its controlled chapter update is propagating", () => {
  const { props } = pagerFixture();
  selectNative(600);
  selectNative(601);
  drawPager(props);
  selectNative(602);
  expect(props.onSelect).toHaveBeenLastCalledWith({
    bookId: "genesis",
    chapter: 603,
  });
  expect(nativeCommands().immediate).not.toHaveBeenCalled();
});
