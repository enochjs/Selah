/** Saved references retain names when a platform recording is no longer published. */
export interface HymnReference {
  id: string;
  title: string;
}

export interface MusicPlaylist {
  id: string;
  name: string;
  hymns: HymnReference[];
}

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

export function playlistName(value: string): string | null {
  const name = value.trim();
  return name.length > 0 && name.length <= 60 ? name : null;
}

export function addHymnReference(
  hymns: HymnReference[],
  hymn: HymnReference,
): HymnReference[] {
  if (hymns.some((item) => item.id === hymn.id)) return hymns;
  return [...hymns, { id: hymn.id, title: hymn.title }];
}

export function moveHymnReference(
  hymns: HymnReference[],
  id: string,
  direction: -1 | 1,
): HymnReference[] {
  const index = hymns.findIndex((item) => item.id === id);
  const target = index + direction;
  if (index < 0 || target < 0 || target >= hymns.length) return hymns;
  const next = [...hymns];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function references(value: unknown): HymnReference[] {
  if (!Array.isArray(value)) return [];
  return value.reduce<HymnReference[]>((items, row: unknown) => {
    if (
      row &&
      typeof row === "object" &&
      "id" in row &&
      typeof row.id === "string" &&
      row.id.trim() &&
      "title" in row &&
      typeof row.title === "string" &&
      row.title.trim()
    )
      return addHymnReference(items, { id: row.id, title: row.title });
    return items;
  }, []);
}

export function restoreMusicLibrary(favorites: unknown, playlists: unknown) {
  const musicPlaylists: MusicPlaylist[] = [];
  if (Array.isArray(playlists)) {
    for (const row of playlists as unknown[]) {
      if (
        !row ||
        typeof row !== "object" ||
        !("id" in row) ||
        typeof row.id !== "string" ||
        !row.id.trim() ||
        !("name" in row) ||
        typeof row.name !== "string" ||
        !playlistName(row.name) ||
        musicPlaylists.some((p) => p.id === row.id)
      )
        continue;
      musicPlaylists.push({
        id: row.id,
        name: playlistName(row.name)!,
        hymns: references("hymns" in row ? row.hymns : []),
      });
    }
  }
  return { favoriteHymns: references(favorites), musicPlaylists };
}
