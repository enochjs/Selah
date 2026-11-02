export interface CloudPlaylist {
  id: string;
  titleZh: string;
  titleEn: string;
  descriptionZh: string;
  descriptionEn: string;
  cover: "morning" | "mountains" | "lake";
  hymnIds: string[];
  enabled: boolean;
}

export interface PlaylistCatalog {
  revision: number;
  items: CloudPlaylist[];
}
