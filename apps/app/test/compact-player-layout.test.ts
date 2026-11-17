import { expect, it } from "vitest";
import { compactPlayerLayout } from "../src/features/audio/compact-player-layout";

it.each([1, 1.5, 2])(
  "centers both text lines with an equal inset at font scale %s",
  (scale) => {
    const layout = compactPlayerLayout(scale);
    const titleTop =
      (layout.height - layout.titleBottomPadding - layout.titleHeight) / 2;
    const bottom = layout.height - layout.detailTop - layout.detailHeight;
    expect(titleTop).toBeCloseTo(bottom);
    expect(layout.detailTop - titleTop - layout.titleHeight).toBeCloseTo(4);
    expect(layout.height).toBeGreaterThanOrEqual(44);
    expect(layout.detailTop + layout.detailHeight).toBeLessThanOrEqual(
      layout.height,
    );
  },
);
