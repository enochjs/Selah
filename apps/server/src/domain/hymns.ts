export interface Hymn {
  id: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  artist: string;
  category: string;
  source: string;
  license: string;
  duration: number;
  audioPath: string;
  enabled: boolean;
}

export interface HymnCatalog {
  revision: number;
  items: Hymn[];
}
