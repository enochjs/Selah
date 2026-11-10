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
  lyrics?: string;
  reviewStatus?: "pending" | "approved" | "rejected";
  reviewNote?: string;
  uploadedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface HymnCatalog {
  revision: number;
  items: Hymn[];
}
