import React, { useState } from "react";
import {
  View,
  ScrollView,
  Image,
  ImageBackground,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { getDocumentAsync } from "expo-document-picker";
import {
  Play,
  Pause,
  Plus,
  Music2,
  Headphones,
  ArrowUpRight,
  Trash2,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAudio } from "./AudioProvider";
import { chapterTracks, hymns, customTrack } from "./catalog";
import { audioUri, saveAudio, deleteAudio } from "./media-storage";
import { audioChapters, bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import {
  Txt,
  Eyebrow,
  Button,
  IconButton,
  Panel,
  Pill,
  Dialog,
} from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
import { formatTime } from "../../domain/playback";
import type { CustomSong } from "../../domain/models";
export function MusicScreen() {
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const songs = useAppStore((s) => s.songs),
    audioLocale = useAppStore((s) => s.audioLocale),
    notify = useAppStore((s) => s.notify);
  const [importing, setImporting] = useState(false),
    [remove, setRemove] = useState<CustomSong | null>(null);
  const catalog = hymns(locale);
  async function importSongs() {
    try {
      const result = await getDocumentAsync({
        type: [
          "audio/mpeg",
          "audio/mp3",
          "audio/mp4",
          "audio/wav",
          "audio/x-wav",
          "audio/flac",
          "audio/x-m4a",
        ],
        multiple: true,
        copyToCacheDirectory: true,
        base64: false,
      });
      if (result.canceled) return;
      setImporting(true);
      let imported = 0;
      for (const asset of result.assets) {
        if ((asset.size ?? 0) > 100 * 1024 * 1024) {
          notify(
            bi(
              "单个文件请小于 100 MB",
              "Please choose files smaller than 100 MB",
            ),
          );
          continue;
        }
        const id = `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const uri = await saveAudio(asset, id);
        useAppStore.getState().addSong({
          id,
          title: asset.name.replace(/\.[^.]+$/, ""),
          uri,
          addedAt: new Date().toISOString(),
        });
        imported++;
      }
      if (imported)
        notify(
          bi(
            `已收藏 ${imported} 首诗歌，可以离线播放`,
            `${imported} tracks added for offline listening`,
          ),
        );
    } catch {
      notify(
        bi(
          "导入失败，请检查文件格式和设备存储空间。",
          "Import failed. Check the file format and available storage.",
        ),
      );
    } finally {
      setImporting(false);
    }
  }
  async function playCustom(song: CustomSong) {
    try {
      const tracks = await Promise.all(
        songs.map(async (s) => customTrack(s, await audioUri(s.uri))),
      );
      audio.playQueue(
        tracks,
        songs.findIndex((s) => s.id === song.id),
      );
    } catch {
      notify(
        bi(
          "无法读取音频，请移除后重新导入。",
          "Unable to read audio. Please remove it and import again.",
        ),
      );
    }
  }
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: mobile ? 20 : 35, paddingBottom: 45 }}
    >
      <View style={{ maxWidth: 1300, alignSelf: "center", width: "100%" }}>
        <Eyebrow>{bi("让赞美，成为日常", "MAKE ROOM FOR WORSHIP")}</Eyebrow>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            marginBottom: 28,
            gap: 15,
          }}
        >
          <Txt
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 26 : 32,
            }}
          >
            {bi("每一个音符，都是祷告。", "Let your soul find its song.")}
          </Txt>
          {!mobile && (
            <Button
              secondary
              small
              icon={Plus}
              onPress={importSongs}
              disabled={importing}
            >
              {bi("导入我的诗歌", "Import your music")}
            </Button>
          )}
        </View>
        <ImageBackground
          source={images.morning}
          imageStyle={{ borderRadius: 16 }}
          style={{
            height: mobile ? 235 : 260,
            borderRadius: 16,
            overflow: "hidden",
          }}
        >
          <LinearGradient
            colors={["#263D32BB", "#263D3233"]}
            start={{ x: 0, y: 1 }}
            end={{ x: 1, y: 0 }}
            style={{
              flex: 1,
              padding: mobile ? 25 : 37,
              justifyContent: "center",
            }}
          >
            <Eyebrow color="#DFE7D5">HYMNS FOR QUIET MORNINGS</Eyebrow>
            <Txt
              style={{
                fontFamily: fonts.serif,
                fontSize: mobile ? 37 : 45,
                color: "#fff",
                marginTop: 14,
              }}
            >
              Amazing grace.
            </Txt>
            <Txt style={{ color: "#E1E7D8", fontSize: 13, marginTop: 10 }}>
              {bi("奇异恩典，如此甘甜。", "How sweet the sound.")}
            </Txt>
            <Button
              small
              icon={Play}
              onPress={() => audio.playQueue(catalog)}
              style={{
                alignSelf: "flex-start",
                marginTop: 25,
                backgroundColor: "#F6F7F0",
              }}
              secondary
            >
              {bi("播放安静歌单", "Play the quiet collection")}
            </Button>
          </LinearGradient>
        </ImageBackground>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 35,
            marginBottom: 19,
          }}
        >
          <View style={{ gap: 7 }}>
            <Eyebrow>WORDS TO LISTEN TO</Eyebrow>
            <Txt style={{ fontSize: 20, fontFamily: fonts.medium }}>
              {bi("聆听话语", "Listen to the Word")}
            </Txt>
          </View>
          <View
            style={{
              flexDirection: "row",
              backgroundColor: c.sidebar,
              borderRadius: 9,
              padding: 3,
            }}
          >
            {(["en", "zh"] as const).map((lang) => (
              <Pill
                key={lang}
                active={audioLocale === lang}
                onPress={() => useAppStore.getState().setAudioLocale(lang)}
              >
                {lang === "en" ? "English" : "中文"}
              </Pill>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: mobile ? "column" : "row", gap: 15 }}>
          {audioChapters.map(({ bookId, chapter }, i) => {
            const book = bibleRepository.getBook(bookId),
              tracks = chapterTracks(bookId, chapter, audioLocale);
            return (
              <Panel key={bookId} style={{ flex: 1, padding: 18 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 13,
                  }}
                >
                  <View
                    style={{
                      backgroundColor: [c.lightGreen, c.sand, "#E9EEF0"][i],
                      borderRadius: 11,
                      padding: 13,
                    }}
                  >
                    <Headphones
                      size={21}
                      color={[c.green, c.gold, c.blue][i]}
                      strokeWidth={1.5}
                    />
                  </View>
                  <View style={{ flex: 1, gap: 5 }}>
                    <Txt style={{ fontFamily: fonts.medium, fontSize: 15 }}>
                      {bi(book.zh, book.en)} {chapter}
                    </Txt>
                    <Txt style={{ color: c.muted, fontSize: 10 }}>
                      {tracks.length === 1 && tracks[0].verse === undefined
                        ? bi("整章录音", "Full chapter")
                        : `${tracks.length} ${bi("节", "verses")}`}{" "}
                      ·{" "}
                      {formatTime(
                        tracks.reduce((sum, t) => sum + (t.duration ?? 0), 0),
                      )}
                    </Txt>
                  </View>
                  <IconButton
                    icon={Play}
                    onPress={() => {
                      useAppStore.getState().setChapter(bookId, chapter);
                      audio.playQueue(tracks);
                    }}
                    label={bi(
                      `播放${book.zh} ${chapter}`,
                      `Play ${book.en} ${chapter}`,
                    )}
                    size={16}
                    active
                  />
                </View>
                <Pressable
                  accessibilityRole="link"
                  onPress={() => {
                    useAppStore.getState().setChapter(bookId, chapter);
                    router.push("/bible");
                  }}
                  style={{
                    flexDirection: "row",
                    gap: 5,
                    alignItems: "center",
                    marginTop: 17,
                  }}
                >
                  <Txt style={{ fontSize: 10, color: c.muted }}>
                    {bi("边读边听", "Read along")}
                  </Txt>
                  <ArrowUpRight size={12} color={c.muted} />
                </Pressable>
              </Panel>
            );
          })}
        </View>
        <View style={{ gap: 7, marginTop: 35, marginBottom: 20 }}>
          <Eyebrow>TIMELESS MELODIES</Eyebrow>
          <Txt style={{ fontSize: 20, fontFamily: fonts.medium }}>
            {bi("让心安静的诗歌", "Hymns to come home to")}
          </Txt>
        </View>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 19 }}>
          {catalog.map((track, i) => (
            <Pressable
              accessibilityRole="button"
              key={track.id}
              onPress={() =>
                audio.track?.id === track.id
                  ? audio.toggle()
                  : audio.playQueue(catalog, i)
              }
              style={({ hovered }) => ({
                flex: 1,
                minWidth: mobile ? 130 : 180,
                maxWidth: mobile ? "48%" : 360,
                opacity: hovered ? 0.9 : 1,
              })}
            >
              <View
                style={{
                  aspectRatio: 1.3,
                  borderRadius: 13,
                  overflow: "hidden",
                  backgroundColor: c.sidebar,
                }}
              >
                <Image
                  source={track.artwork}
                  style={{ width: "100%", height: "100%" }}
                />
                <LinearGradient
                  colors={["transparent", "#24332377"]}
                  style={{ position: "absolute", inset: 0 }}
                />
                <View
                  style={{
                    position: "absolute",
                    bottom: 15,
                    right: 15,
                    borderRadius: 25,
                    padding: 13,
                    backgroundColor: "#FFFFFFEA",
                  }}
                >
                  {audio.track?.id === track.id && audio.playing ? (
                    <Pause size={17} color={c.green} fill={c.green} />
                  ) : (
                    <Play size={17} color={c.green} fill={c.green} />
                  )}
                </View>
              </View>
              <Txt
                style={{
                  fontFamily: fonts.medium,
                  fontSize: 15,
                  marginTop: 14,
                }}
              >
                {track.title}
              </Txt>
              <Txt
                style={{
                  color: c.muted,
                  fontSize: 10,
                  lineHeight: 19,
                  marginTop: 5,
                }}
              >
                {track.subtitle}
              </Txt>
            </Pressable>
          ))}
        </View>
        <Panel style={{ marginTop: 34, padding: mobile ? 21 : 27 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 7 }}>
              <Eyebrow>YOUR OWN SOUNDTRACK</Eyebrow>
              <Txt style={{ fontSize: 20, fontFamily: fonts.medium }}>
                {bi("我的诗歌收藏", "Your music, your moments")}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 11, lineHeight: 20 }}>
                {bi(
                  "把喜爱的 MP3 放在这里，随时随地离线聆听。",
                  "Bring your favorite MP3s. Listen offline, wherever you are.",
                )}
              </Txt>
            </View>
            <IconButton
              icon={Plus}
              active
              onPress={importSongs}
              label={bi("导入诗歌", "Import music")}
              disabled={importing}
              style={{ backgroundColor: c.lightGreen }}
            />
          </View>
          {importing && (
            <ActivityIndicator color={c.green} style={{ marginTop: 20 }} />
          )}
          {!songs.length && (
            <View style={{ alignItems: "center", padding: 27, gap: 13 }}>
              <Music2 size={27} strokeWidth={1.2} color="#ADB69D" />
              <Txt style={{ fontSize: 12, color: c.muted }}>
                {bi(
                  "这里，留给你珍爱的旋律。",
                  "A space for the melodies you love.",
                )}
              </Txt>
              <Button
                small
                secondary
                icon={Plus}
                disabled={importing}
                onPress={importSongs}
              >
                {bi("选择本地音频", "Choose audio files")}
              </Button>
            </View>
          )}
          {songs.map((song, i) => (
            <View
              key={song.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 14,
                paddingVertical: 15,
                borderTopWidth: 1,
                borderColor: c.border,
                marginTop: i ? 0 : 20,
              }}
            >
              <Music2 size={17} color={c.green} />
              <Pressable
                accessibilityRole="button"
                onPress={() => playCustom(song)}
                style={{ flex: 1, gap: 6 }}
              >
                <Txt style={{ fontSize: 13 }}>{song.title}</Txt>
                <Txt style={{ fontSize: 10, color: c.muted }}>
                  {bi(
                    "本地收藏 · 离线可用",
                    "Your collection · Available offline",
                  )}
                </Txt>
              </Pressable>
              <IconButton
                icon={
                  audio.track?.id === song.id && audio.playing ? Pause : Play
                }
                onPress={() =>
                  audio.track?.id === song.id
                    ? audio.toggle()
                    : playCustom(song)
                }
                label={bi("播放诗歌", "Play track")}
                active={audio.track?.id === song.id}
                size={16}
              />
              <IconButton
                icon={Trash2}
                onPress={() => setRemove(song)}
                label={bi("移除诗歌", "Remove track")}
                size={14}
              />
            </View>
          ))}
        </Panel>
        <Txt
          style={{
            color: "#A6AB9D",
            fontSize: 10,
            marginTop: 20,
            lineHeight: 19,
          }}
        >
          {bi(
            "内置赞美诗为根据公版旋律生成的钢琴音色演奏示例；可导入你拥有使用权的演唱录音。",
            "Bundled hymns are synthesized instrumental renditions of public-domain melodies. Import recordings you have permission to use.",
          )}
        </Txt>
      </View>
      <Dialog
        visible={!!remove}
        onClose={() => setRemove(null)}
        title={bi("移除这首诗歌？", "Remove this track?")}
      >
        <Txt style={{ lineHeight: 23, color: c.muted }}>
          {bi(
            `将从本地收藏中移除「${remove?.title}」，原始文件不受影响。`,
            `“${remove?.title}” will be removed from this library. Your original file is kept.`,
          )}
        </Txt>
        <Button
          style={{ marginTop: 25 }}
          onPress={async () => {
            if (!remove) return;
            try {
              if (audio.track?.id === remove.id && audio.playing)
                audio.toggle();
              await deleteAudio(remove.uri);
              useAppStore.getState().removeSong(remove.id);
              setRemove(null);
            } catch {
              notify(
                bi(
                  "移除失败，请重试。",
                  "Could not remove the track. Please try again.",
                ),
              );
            }
          }}
        >
          {bi("移除", "Remove track")}
        </Button>
      </Dialog>
    </ScrollView>
  );
}
