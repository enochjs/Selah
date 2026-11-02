export interface DailyVerseSharePayload {
  date: string;
  reference: string;
  primaryText: string;
  secondaryText: string;
  primaryLocale: "zh" | "en";
  imageUri: string;
  imageAuthor: string;
  imageSourceUrl: string;
  imageLicense: string;
  imageLicenseUrl: string;
}
export type ShareImageFormat = "square" | "portrait";
export interface ShareTextBlock {
  lines: string[];
  fontSize: number;
  lineHeight: number;
  y: number;
  secondary?: boolean;
}
export type TextMeasure = (text: string, fontSize: number) => number;

/** Break at English words and Chinese characters; split oversized words as needed. */
export function wrapShareText(
  text: string,
  width: number,
  size: number,
  measure: TextMeasure,
): string[] {
  return text.split("\n").flatMap((paragraph) => {
    const tokens =
      paragraph.match(/[A-Za-z0-9’'\u00c0-\u024f]+|\s+|[^\s]/gu) ?? [];
    const lines: string[] = [];
    let line = "";
    for (const token of tokens) {
      if (measure(line + token, size) <= width) {
        line += token;
        continue;
      }
      if (!token.trim()) continue;
      if (line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }
      for (const char of token.trimStart()) {
        if (line && measure(line + char, size) > width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    if (line.trim() || !lines.length) lines.push(line.trimEnd());
    return lines;
  });
}
export const estimateShareText: TextMeasure = (text, size) =>
  Array.from(text).reduce(
    (sum, char) =>
      sum +
      (/[^\u0000-\u024f]/u.test(char)
        ? 1.05
        : /[MW@]/.test(char)
          ? 0.98
          : 0.67),
    0,
  ) * size;

export function layoutShareText(
  payload: DailyVerseSharePayload,
  format: ShareImageFormat,
  measure: TextMeasure = estimateShareText,
) {
  const height = format === "square" ? 1080 : 1920;
  const available = height - 560;
  let size = format === "square" ? 56 : 68;
  let primary: string[] = [];
  let secondary: string[] = [];
  let total = Infinity;
  // No truncation: reduce until every line fits, including exceptionally long verses.
  while (size > 0.5) {
    primary = wrapShareText(payload.primaryText, 888, size, measure);
    secondary = wrapShareText(payload.secondaryText, 888, size * 0.76, measure);
    total =
      primary.length * size * 1.48 +
      secondary.length * size * 0.76 * 1.48 +
      112;
    if (total <= available) break;
    size *= 0.95;
  }
  const y = 206 + (available - total) / 2;
  const blocks: ShareTextBlock[] = [
    { lines: primary, fontSize: size, lineHeight: size * 1.48, y },
    {
      lines: secondary,
      fontSize: size * 0.76,
      lineHeight: size * 0.76 * 1.48,
      y: y + primary.length * size * 1.48 + 76,
      secondary: true,
    },
  ];
  return {
    width: 1080,
    height,
    blocks,
    primaryVersion: payload.primaryLocale === "zh" ? "和合本" : "NIV",
    secondaryVersion: payload.primaryLocale === "zh" ? "NIV" : "和合本",
  };
}
export function shareImageFilename(
  payload: DailyVerseSharePayload,
  format: ShareImageFormat,
) {
  return `selah-${payload.date.replace(/[^0-9-]/g, "")}-${format}.png`;
}

/** Keep complete source/license attribution inside its own footer region. */
export function layoutShareAttribution(
  payload: DailyVerseSharePayload,
  format: ShareImageFormat,
  measure: TextMeasure = estimateShareText,
) {
  const height = format === "square" ? 1080 : 1920;
  const text = `Photo: ${payload.imageAuthor} · resized/cropped; dark overlay\nSource: ${payload.imageSourceUrl}\n${payload.imageLicense}: ${payload.imageLicenseUrl}`;
  let fontSize = 17;
  let lines = wrapShareText(text, 888, fontSize, measure);
  while (lines.length * fontSize * 1.4 > 154 && fontSize > 0.5) {
    fontSize *= 0.95;
    lines = wrapShareText(text, 888, fontSize, measure);
  }
  return {
    lines,
    fontSize,
    lineHeight: fontSize * 1.4,
    y: height - 190,
    width: 888,
    availableHeight: 154,
  };
}
