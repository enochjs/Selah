import React, { useRef, useState } from "react";
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
  Trash2,
  Download,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAudio } from "./AudioProvider";
import { hymns, customTrack } from "./catalog";
import { audioUri, saveAudio, deleteAudio } from "./media-storage";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Button, IconButton, Panel, Dialog } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
import type { CustomSong } from "../../domain/models";
export function MusicScreen() {
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const songs = useAppStore((s) => s.songs),
    notify = useAppStore((s) => s.notify);
  const [importing, setImporting] = useState(false),
    [remove, setRemove] = useState<CustomSong | null>(null);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState("");
  const removingRef = useRef(false);
  async function removeTrack() {
    if (!remove || removingRef.current) return;
    removingRef.current = true;
    setRemoving(true);
    setRemoveError("");
    try {
      if (audio.track?.id === remove.id && audio.playing) audio.toggle();
      await deleteAudio(remove.uri);
      useAppStore.getState().removeSong(remove.id);
      setRemove(null);
    } catch {
      setRemoveError(
        bi(
          "移除失败，请重试。",
          "Could not remove the track. Please try again.",
        ),
      );
    } finally {
      removingRef.current = false;
      setRemoving(false);
    }
  }
  function closeRemove() {
    if (!removingRef.current) {
      setRemove(null);
      setRemoveError("");
    }
  }
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
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            marginBottom: 16,
            gap: 15,
          }}
        >
          <Txt
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 26 : 32,
            }}
          >
            {bi("聆听", "Listen")}
          </Txt>
          <IconButton
            icon={Download}
            onPress={() => router.push("/downloads")}
            label={bi("离线音频", "Offline audio")}
          />
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
            minHeight: mobile ? 156 : 210,
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
              padding: mobile ? 20 : 30,
              justifyContent: "center",
            }}
          >
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: mobile ? 26 : 34,
                color: "#fff",
                marginTop: 14,
              }}
            >
              {bi("让心，在赞美中安静。", "Quiet melodies.")}
            </Txt>
            <Button
              small
              icon={Play}
              onPress={() => audio.playQueue(catalog)}
              disabled={!catalog.length}
              style={{
                alignSelf: "flex-start",
                marginTop: 18,
                backgroundColor: "#F6F7F0",
              }}
              secondary
            >
              {catalog.length
                ? bi("播放安静歌单", "Play the quiet collection")
                : bi("暂无可用的平台诗歌", "No platform hymns available")}
            </Button>
          </LinearGradient>
        </ImageBackground>
        <View style={{ gap: 7, marginTop: 35, marginBottom: 20 }}>
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
                  fontSize: 12,
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
              <Txt style={{ fontSize: 20, fontFamily: fonts.medium }}>
                {bi("我的诗歌收藏", "Your music, your moments")}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 20 }}>
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
                style={{
                  flex: 1,
                  gap: 6,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Txt style={{ fontSize: 13 }}>{song.title}</Txt>
                <Txt style={{ fontSize: 12, color: c.muted }}>
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
                label={
                  audio.track?.id === song.id
                    ? audio.playing
                      ? bi("暂停诗歌", "Pause track")
                      : bi("继续播放诗歌", "Resume track")
                    : bi("播放诗歌", "Play track")
                }
                active={audio.track?.id === song.id}
                size={16}
              />
              <IconButton
                icon={Trash2}
                onPress={() => {
                  setRemoveError("");
                  setRemove(song);
                }}
                label={bi("移除诗歌", "Remove track")}
                size={14}
              />
            </View>
          ))}
        </Panel>
        <Txt
          style={{
            color: c.muted,
            fontSize: 12,
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
        onClose={closeRemove}
        title={bi("移除这首诗歌？", "Remove this track?")}
        dismissible={!removing}
        presentation={mobile ? "bottom" : "center"}
        heightMode="content"
        footer={
          <View style={{ padding: 20, gap: 10 }}>
            {!!removeError && (
              <Txt
                accessibilityRole="alert"
                style={{ color: c.red, fontSize: 13, lineHeight: 21 }}
              >
                {removeError}
              </Txt>
            )}
            <Button secondary disabled={removing} onPress={closeRemove}>
              {bi("保留诗歌", "Keep track")}
            </Button>
            <Button
              style={{ backgroundColor: c.red }}
              disabled={removing}
              onPress={removeTrack}
            >
              {removing
                ? bi("正在移除…", "Removing…")
                : bi("确认移除", "Remove track")}
            </Button>
          </View>
        }
      >
        <Txt style={{ lineHeight: 23, color: c.muted }}>
          {bi(
            `将从本地收藏中移除「${remove?.title}」，原始文件不受影响。`,
            `“${remove?.title}” will be removed from this library. Your original file is kept.`,
          )}
        </Txt>
      </Dialog>
    </ScrollView>
  );
}
