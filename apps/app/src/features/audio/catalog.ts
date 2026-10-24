import type { AudioTrack, Locale, CustomSong } from "../../domain/models";
import { bibleRepository } from "../../data/bible-repository";
import { getChapterRecording } from "../../data/audio-repository";
import { resourceUrl } from "../../config/resources";
import { images } from "../../shared/theme";
import { recordingAudioItems } from "../../domain/scripture-audio";
import hymnCatalog from "@selah/content/hymns.json";

export function chapterTracks(
  bookId: string,
  chapter: number,
  locale: Locale,
): AudioTrack[] {
  const book = bibleRepository.getBook(bookId);
  const recording = getChapterRecording(bookId, chapter, locale);
  const uri = recording ? resourceUrl(recording.path) : null;
  if (!recording || !uri) return [];
  const artwork =
    bookId === "genesis"
      ? images.morning
      : bookId === "john"
        ? images.mountains
        : images.lake;
  const verses = bibleRepository.getChapter(bookId, chapter);
  const items = recordingAudioItems(recording);
  if (!items.length)
    return [
      {
        id: `${bookId}-${chapter}-${locale}`,
        title: `${locale === "zh" ? book.zh : book.en} ${chapter}`,
        subtitle:
          locale === "zh"
            ? "整章录音 · 无可用分句时间轴"
            : "Chapter recording · Verse timing unavailable",
        kind: "scripture",
        bookId,
        chapter,
        locale,
        source: { uri },
        artwork,
        duration: recording.duration,
        timingQuality: "unaligned",
      },
    ];
  return items.map(
    ({
      verse: number,
      path,
      startTime,
      endTime,
      duration,
      coveredVerses,
      chapterRange,
    }) => ({
      id: `${bookId}-${chapter}-${number}-${locale}`,
      title: `${locale === "zh" ? book.zh : book.en} ${chapter}:${coveredVerses?.length ? `${coveredVerses[0]}–${coveredVerses.at(-1)}` : number}`,
      subtitle: verses.find((v) => v.number === number)?.[locale] ?? "",
      kind: "scripture",
      bookId,
      chapter,
      verse: number,
      coveredVerses,
      locale,
      source: { uri: resourceUrl(path)! },
      artwork,
      startTime,
      endTime,
      duration,
      timingQuality: recording.timingQuality,
      ...(chapterRange
        ? { chapterAudio: { source: { uri }, ...chapterRange } }
        : {}),
    }),
  );
}
export function hymns(locale: Locale): AudioTrack[] {
  const zh = locale === "zh";
  const assets: Record<string, { source: number; artwork: number }> = {
    "amazing-grace": {
      source: require("../../../assets/audio/amazing-grace.mp3"),
      artwork: images.morning,
    },
    "be-thou-my-vision": {
      source: require("../../../assets/audio/be-thou-my-vision.mp3"),
      artwork: images.mountains,
    },
    doxology: {
      source: require("../../../assets/audio/doxology.mp3"),
      artwork: images.lake,
    },
  };
  return hymnCatalog.items
    .filter((item) => item.enabled && Object.hasOwn(assets, item.id))
    .map((item) => ({
      id: item.id,
      title: zh ? item.titleZh : item.titleEn,
      subtitle: zh ? item.subtitleZh : item.subtitleEn,
      kind: "hymn",
      duration: item.duration,
      ...assets[item.id],
    }));
}
export function customTrack(song: CustomSong, uri: string): AudioTrack {
  return {
    id: song.id,
    title: song.title,
    subtitle: "My collection · 我的收藏",
    source: { uri },
    kind: "hymn",
    artwork: images.morning,
  };
}
