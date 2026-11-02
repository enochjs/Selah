import type { Locale } from "../domain/models";
import {
  defaultReadingFonts,
  type ReadingFonts,
} from "../domain/reading-fonts";
import { fonts } from "./theme";
import { systemFontFamily } from "./system-font";

interface ReadingFontOption<T extends string> {
  value: T;
  zh: string;
  en: string;
  family: string;
  description: { zh: string; en: string };
}

export const readingFontOptions: {
  [K in Locale]: readonly ReadingFontOption<ReadingFonts[K]>[];
} = {
  zh: [
    {
      value: "noto-serif-sc",
      zh: "思源宋体",
      en: "Noto Serif SC",
      family: fonts.scriptureZh,
      description: { zh: "经典书卷感", en: "Classic book typography" },
    },
    {
      value: "noto-sans-sc",
      zh: "思源黑体",
      en: "Noto Sans SC",
      family: "SelahSansSC_400Regular",
      description: { zh: "简洁清晰", en: "Clean and clear" },
    },
    {
      value: "lxgw-wenkai",
      zh: "霞鹜文楷",
      en: "LXGW WenKai",
      family: "SelahWenKai_400Regular",
      description: { zh: "柔和手写感", en: "Gentle handwritten feel" },
    },
    {
      value: "system",
      zh: "系统字体",
      en: "System",
      family: systemFontFamily,
      description: { zh: "使用设备默认字体", en: "Your device’s default font" },
    },
  ],
  en: [
    {
      value: "source-serif-4",
      zh: "Source Serif 4",
      en: "Source Serif 4",
      family: fonts.scriptureEn,
      description: { zh: "经典正文衬线体", en: "Classic reading serif" },
    },
    {
      value: "lora",
      zh: "Lora",
      en: "Lora",
      family: "Lora_400Regular",
      description: { zh: "柔和优雅的衬线体", en: "Soft, expressive serif" },
    },
    {
      value: "dm-sans",
      zh: "DM Sans",
      en: "DM Sans",
      family: "DMSans_400Regular",
      description: { zh: "简洁现代的无衬线体", en: "Clean, modern sans serif" },
    },
    {
      value: "system",
      zh: "系统字体",
      en: "System",
      family: systemFontFamily,
      description: { zh: "使用设备默认字体", en: "Your device’s default font" },
    },
  ],
};

export function readingFontFamily(
  language: Locale,
  selection: ReadingFonts = defaultReadingFonts,
): string {
  const options = readingFontOptions[language];
  return (
    options.find((font) => font.value === selection[language]) ?? options[0]
  ).family;
}
