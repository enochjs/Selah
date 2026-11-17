/** Text rhythm is independent of the controls' minimum touch height. */
export function compactPlayerLayout(fontScale: number) {
  const titleHeight = 20 * fontScale;
  const detailHeight = 16 * fontScale;
  const height = Math.max(44, titleHeight + 4 + detailHeight);
  const inset = (height - titleHeight - 4 - detailHeight) / 2;
  return {
    height,
    titleHeight,
    detailHeight,
    titleBottomPadding: height - 2 * (inset + titleHeight / 2),
    detailTop: inset + titleHeight + 4,
  };
}
