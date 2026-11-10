import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { expect, it } from "vitest";

const require = createRequire(import.meta.url);
const pagerRoot = dirname(
  require.resolve("react-native-pager-view/package.json"),
);
const nativeSource = readFileSync(
  join(
    pagerRoot,
    "android/src/main/java/com/reactnativepagerview/ComposePagerView.kt",
  ),
  "utf8",
);

// Device regression covers actual dragging. These checks ensure a fresh
// dependency install retains the Android handoff used by that regression.
it("retains a margin between horizontal paging and diagonal reading gestures", () => {
  expect(nativeSource).toContain("dx.absoluteValue <= dy.absoluteValue * 1.2f");
});

it("hands diagonal gestures to a vertical ScrollView even for a short chapter", () => {
  expect(nativeSource).toContain(
    "view is ScrollView || view.canScrollVertically(1)",
  );
});

it("only cancels React presses when the pager owns the gesture", () => {
  expect(nativeSource).toContain("!isGestureResolved || isGestureAcross");
});
