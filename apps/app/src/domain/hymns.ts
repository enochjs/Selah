export interface PublishedHymn {
  id: string;
  titleZh: string;
  titleEn: string;
  subtitleZh: string;
  subtitleEn: string;
  artist?: string;
  duration: number;
  audioPath: string;
  enabled: boolean;
  reviewStatus?: string;
  lyrics?: string;
}
