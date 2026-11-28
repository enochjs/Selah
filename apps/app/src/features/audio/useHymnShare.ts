import type { AudioTrack } from "../../domain/models";
import { resourceUrl } from "../../config/resources";
import { useI18n } from "../../shared/i18n";
import { useAppStore } from "../../state/app-store";
import { presentHymnShare } from "./hymn-share";

export function useHymnShare(track?: AudioTrack | null) {
  const { bi } = useI18n();
  const hymn = track?.hymn;
  if (
    track?.kind !== "hymn" ||
    !hymn?.enabled ||
    (hymn.reviewStatus && hymn.reviewStatus !== "approved")
  )
    return undefined;

  const url = resourceUrl(
    `/hymns/${encodeURIComponent(hymn.id)}${bi("", "?lang=en")}`,
  );
  if (!url) return undefined;
  const { title } = track;
  const artist = hymn.artist?.trim();
  const text = artist ? `${title} · ${artist}` : title;

  return async () => {
    const { notify } = useAppStore.getState();
    try {
      if ((await presentHymnShare({ title, text, url })) === "copied")
        notify(bi("诗歌链接已复制", "Hymn link copied"));
    } catch {
      notify(
        bi("暂时无法分享诗歌，请重试", "Could not share the hymn. Try again."),
      );
    }
  };
}
