import data from "@selah/content/resource-manifest.json";
import type { Locale } from "../domain/models";

interface ResourceVersion {
  id: string;
  name: string;
  voiceType?: string;
  reader?: string;
  attribution?: string;
}
interface ResourceManifest {
  resourceSet?: string;
  recordings: number;
  alignedRecordings: number;
  pendingRecordings: number;
  reviewRecordings: number;
  providerTimingRecordings?: number;
  localTimingRecordings?: number;
  verseFileRecordings?: number;
  versions: Record<Locale, ResourceVersion>;
}
export const resourceManifest = data as ResourceManifest;
export const englishVersion = resourceManifest.versions.en.id.toUpperCase();
export function audioVersionLabel(locale: Locale): string {
  return locale === "en"
    ? `English · ${englishVersion}`
    : resourceManifest.versions.zh.voiceType === "synthetic"
      ? "中文 · 和合本 · 合成朗读"
      : "中文 · 原项目录音";
}
export const resourceLinks = [
  {
    title: "BSB · 文字与授权 / Text & license",
    url: "https://berean.bible/terms.htm",
  },
  {
    title: "BSB · Barry Hays 真人录音 / Human narration",
    url: "https://bereanbible.com/audio/",
  },
  {
    title: "AO Lab · 配套时间轴 / Audio timings",
    url: "https://bible.helloao.org/docs/reference/translations/standard.html",
  },
  {
    title: "中文逐节 MP3 · Eliran Wong / Unique Bible App",
    url: "https://github.com/eliranwong/MP3_ChineseUnionVersion_mandarin",
  },
  {
    title: "中文录音授权 · CC BY 4.0",
    url: "https://creativecommons.org/licenses/by/4.0/",
  },
] as const;
