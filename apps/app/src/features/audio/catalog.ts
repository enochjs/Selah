import type { AudioTrack, Locale, CustomSong } from "../../domain/models";
import { bibleRepository } from "../../data/bible-repository";
import { getChapterRecording } from "../../data/audio-repository";
import { resourceUrl } from "../../config/resources";
import { images } from "../../shared/theme";
import { recordingAudioItems } from "../../domain/scripture-audio";

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
    ({ verse: number, path, startTime, endTime, duration, coveredVerses }) => ({
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
    }),
  );
}
export function hymns(locale: Locale): AudioTrack[] {
  const zh = locale === "zh";
  return [
    {
      id: "amazing-grace",
      title: zh ? "奇异恩典" : "Amazing Grace",
      subtitle: zh
        ? "传统赞美诗 · 钢琴音色纯音乐"
        : "Traditional hymn · Piano instrumental",
      source: require("../../../assets/audio/amazing-grace.mp3"),
      kind: "hymn",
      artwork: images.morning,
    },
    {
      id: "be-thou-my-vision",
      title: zh ? "成为我异象" : "Be Thou My Vision",
      subtitle: zh
        ? "爱尔兰传统圣诗 · 钢琴音色纯音乐"
        : "Irish traditional · Piano instrumental",
      source: require("../../../assets/audio/be-thou-my-vision.mp3"),
      kind: "hymn",
      artwork: images.mountains,
    },
    {
      id: "doxology",
      title: zh ? "三一颂" : "Doxology",
      subtitle: zh
        ? "传统赞美诗 · 钢琴音色纯音乐"
        : "Old Hundredth · Piano instrumental",
      source: require("../../../assets/audio/doxology.mp3"),
      kind: "hymn",
      artwork: images.lake,
    },
  ];
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
