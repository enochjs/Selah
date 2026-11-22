import type { Locale, Verse } from "../domain/models";
import { englishVersion, resourceManifest } from "./resource-info";

export interface ReadingVersion {
  id: string;
  language: string;
  label: string;
  builtInLocale?: Locale;
}

export const primaryVersions: Record<Locale, ReadingVersion> = {
  zh: {
    id: resourceManifest.versions.zh.id,
    language: "zh",
    label: `中文 · ${resourceManifest.versions.zh.name}`,
    builtInLocale: "zh",
  },
  en: {
    id: resourceManifest.versions.en.id,
    language: "en",
    label: `English · ${englishVersion}`,
    builtInLocale: "en",
  },
};

const versions: readonly ReadingVersion[] = [
  ...Object.values(primaryVersions),
  ...(resourceManifest.comparisonVersions ?? []),
];

export function comparisonVersions(primaryLocale: Locale) {
  return versions.filter(
    (version) => version.id !== primaryVersions[primaryLocale].id,
  );
}

export function resolveComparisonVersion(
  primaryLocale: Locale,
  savedId?: string | null,
) {
  const options = comparisonVersions(primaryLocale);
  return options.find((version) => version.id === savedId) ?? options[0];
}

export function versionText(verse: Verse, version: ReadingVersion): string {
  return version.builtInLocale
    ? verse[version.builtInLocale]
    : (verse.translations?.[version.id] ?? "");
}
