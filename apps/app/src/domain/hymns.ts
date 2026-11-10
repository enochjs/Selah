export interface PublishedHymn {
  id: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  duration: number;
  audioPath: string;
  enabled: boolean;
  reviewStatus?: string;
  lyrics?: string;
}
