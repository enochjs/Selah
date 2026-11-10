import React, { type PropsWithChildren } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { ScrollViewProps } from "react-native";
const context = vi.hoisted(() => ({ props: null as ScrollViewProps | null }));
vi.mock("react-native", () => ({
  ScrollView: (props: ScrollViewProps) => {
    context.props = props;
    return React.createElement("main", null, props.children);
  },
}));
import { ReaderScrollView } from "../src/features/reader/ReaderScrollView.native";
it("preserves vertical scroll events and layout inside the native pager", () => {
  const onScroll = vi.fn(),
    onLayout = vi.fn();
  const html = renderToStaticMarkup(
    React.createElement(ReaderScrollView, {
      onScroll,
      onLayout,
      nestedScrollEnabled: true,
      children: "verse text",
    }),
  );
  expect(html).toBe("<main>verse text</main>");
  expect(context.props).toMatchObject({
    onScroll,
    onLayout,
    nestedScrollEnabled: true,
  });
});
