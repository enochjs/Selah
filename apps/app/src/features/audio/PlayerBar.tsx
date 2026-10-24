import React, { useState } from "react";
import { View, Image, Pressable, useWindowDimensions } from "react-native";
import Slider from "@react-native-community/slider";
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  Repeat1,
  Volume2,
  ListMusic,
  AudioLines,
} from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { AudioControlsDialog } from "./AudioControlsDialog";
import { useI18n } from "../../shared/i18n";
import { Txt, IconButton } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
export function PlayerBar() {
  const audio = useAudio();
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [showControls, setShowControls] = useState(false);
  const bookId = useAppStore((s) => s.bookId),
    chapter = useAppStore((s) => s.chapter);
  const book = bibleRepository.getBook(bookId);
  const chapterOnly =
    audio.track?.kind === "scripture" && audio.track.verse === undefined;
  const repeatLabel =
    audio.repeat === "verse"
      ? chapterOnly
        ? bi("整章循环", "Repeat chapter")
        : bi("单句循环", "Repeat verse")
      : audio.repeat === "chapter"
        ? bi("整章循环", "Repeat chapter")
        : bi("顺序播放", "Repeat off");
  const cycleRepeat = () =>
    audio.setRepeat(
      audio.repeat === "off"
        ? "verse"
        : chapterOnly
          ? "off"
          : audio.repeat === "verse"
            ? "chapter"
            : "off",
    );
  return (
    <>
      <View
        style={{
          backgroundColor: "#fff",
          borderTopWidth: 1,
          borderTopColor: c.border,
          paddingHorizontal: compact ? 10 : 28,
          paddingVertical: compact ? 8 : 16,
          flexDirection: "row",
          alignItems: "center",
          gap: compact ? 4 : 18,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            gap: 12,
            alignItems: "center",
            flex: 1,
            minWidth: 0,
          }}
        >
          {(!compact || width >= 520) && (
            <Image
              source={audio.track?.artwork ?? images.lake}
              style={{ width: 42, height: 42, borderRadius: 9 }}
            />
          )}
          <View style={{ flex: 1, gap: 5 }}>
            <Txt
              numberOfLines={1}
              style={{ fontFamily: fonts.bold, fontSize: compact ? 12 : 13 }}
            >
              {audio.track?.title ?? `${bi(book.zh, book.en)} ${chapter}`}
            </Txt>
            {!compact && (
              <Txt numberOfLines={1} style={{ color: c.muted, fontSize: 11 }}>
                {audio.track
                  ? audio.track.kind === "scripture"
                    ? audio.track.timingQuality === "unaligned"
                      ? bi(
                          "圣经录音 · 整章播放",
                          "Scripture recording · Full chapter",
                        )
                      : bi(
                          "圣经录音 · 逐句定位",
                          "Scripture recording · Verse navigation",
                        )
                    : audio.track.subtitle
                  : bi("让话语，进入心里", "Let the Word find its way in")}
              </Txt>
            )}
          </View>
          {!compact && (
            <AudioLines size={17} color={audio.playing ? c.green : c.border} />
          )}
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            flex: compact ? undefined : 1,
            gap: compact ? 2 : 17,
          }}
        >
          <IconButton
            icon={SkipBack}
            onPress={audio.previous}
            label={bi("上一句", "Previous track")}
            size={compact ? 16 : 18}
            disabled={!audio.track}
            style={compact ? { width: 36, height: 44 } : undefined}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              audio.playing ? bi("暂停", "Pause") : bi("播放", "Play")
            }
            onPress={audio.toggle}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              backgroundColor: c.green,
              alignItems: "center",
              justifyContent: "center",
              opacity: pressed ? 0.75 : 1,
            })}
          >
            {audio.playing ? (
              <Pause size={17} color="#fff" fill="#fff" />
            ) : (
              <Play
                size={17}
                color="#fff"
                fill="#fff"
                style={{ marginLeft: 2 }}
              />
            )}
          </Pressable>
          <IconButton
            icon={SkipForward}
            onPress={audio.next}
            label={bi("下一句", "Next track")}
            size={compact ? 16 : 18}
            style={compact ? { width: 36, height: 44 } : undefined}
            disabled={
              !audio.track ||
              (audio.index === audio.queue.length - 1 &&
                audio.repeat !== "chapter")
            }
          />
        </View>
        <View
          style={{
            flex: compact ? undefined : 1,
            flexDirection: "row",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: compact ? 0 : 8,
          }}
        >
          <IconButton
            icon={audio.repeat === "verse" ? Repeat1 : Repeat}
            onPress={cycleRepeat}
            label={repeatLabel}
            active={audio.repeat !== "off"}
            size={16}
            style={compact ? { width: 36, height: 44 } : undefined}
          />
          <Pressable
            onPress={() => setShowControls(true)}
            accessibilityRole="button"
            accessibilityLabel={bi(
              `播放速度，当前 ${audio.rate} 倍`,
              `Playback speed, currently ${audio.rate} times`,
            )}
            style={({ pressed }) => ({
              minWidth: 36,
              height: 44,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: audio.rate !== 1 ? c.lightGreen : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Txt
              style={{
                fontSize: 11,
                color: audio.rate !== 1 ? c.green : c.muted,
              }}
            >
              {audio.rate}×
            </Txt>
          </Pressable>
          {width > 1150 && (
            <>
              <Volume2 size={16} color={c.muted} />
              <Slider
                accessibilityLabel={bi("音量", "Volume")}
                style={{ width: 73 }}
                minimumValue={0}
                maximumValue={1}
                value={audio.volume}
                onValueChange={audio.setVolume}
                minimumTrackTintColor={c.green}
                maximumTrackTintColor={c.border}
                thumbTintColor={c.green}
              />
            </>
          )}
          <IconButton
            icon={ListMusic}
            onPress={() => setShowControls(true)}
            label={bi("播放队列", "Play queue")}
            size={18}
            style={compact ? { width: 36, height: 44 } : undefined}
          />
        </View>
      </View>
      <AudioControlsDialog
        visible={showControls}
        onClose={() => setShowControls(false)}
      />
    </>
  );
}
