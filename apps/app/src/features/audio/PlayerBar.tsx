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
  Check,
} from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { useI18n } from "../../shared/i18n";
import { Txt, IconButton, Dialog, Pill } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
import { formatTime } from "../../domain/playback";
import { useAppStore } from "../../state/app-store";
import { bibleRepository } from "../../data/bible-repository";
export function PlayerBar() {
  const audio = useAudio();
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const compact = width < 760;
  const [showQueue, setShowQueue] = useState(false);
  const [showSpeed, setShowSpeed] = useState(false);
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
          paddingHorizontal: compact ? 14 : 28,
          paddingVertical: compact ? 10 : 16,
          gap: compact ? 3 : 12,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: compact ? 8 : 18,
          }}
        >
          <View
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "center",
              flex: compact ? 1 : 0.95,
              minWidth: 0,
            }}
          >
            <Image
              source={audio.track?.artwork ?? images.lake}
              style={{
                width: compact ? 42 : 50,
                height: compact ? 42 : 50,
                borderRadius: 9,
              }}
            />
            <View style={{ flex: 1, gap: 5 }}>
              <Txt
                numberOfLines={1}
                style={{ fontFamily: fonts.bold, fontSize: 13 }}
              >
                {audio.track?.title ?? `${bi(book.zh, book.en)} ${chapter}`}
              </Txt>
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
            </View>
            {!compact && (
              <AudioLines
                size={17}
                color={audio.playing ? c.green : c.border}
              />
            )}
          </View>
          <View
            style={{
              flex: compact ? undefined : 1.3,
              alignItems: "center",
              gap: 7,
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: compact ? 8 : 17,
              }}
            >
              {!compact && (
                <IconButton
                  icon={audio.repeat === "verse" ? Repeat1 : Repeat}
                  onPress={cycleRepeat}
                  label={repeatLabel}
                  active={audio.repeat !== "off"}
                  size={16}
                />
              )}
              <IconButton
                icon={SkipBack}
                onPress={audio.previous}
                label={bi("上一句", "Previous track")}
                size={compact ? 16 : 18}
                disabled={!audio.track}
                style={compact ? { width: 28 } : undefined}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={
                  audio.playing ? bi("暂停", "Pause") : bi("播放", "Play")
                }
                onPress={audio.toggle}
                style={({ pressed }) => ({
                  width: compact ? 39 : 40,
                  height: compact ? 39 : 40,
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
                style={compact ? { width: 28 } : undefined}
                disabled={
                  !audio.track ||
                  (audio.index === audio.queue.length - 1 &&
                    audio.repeat !== "chapter")
                }
              />
              {!compact && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={bi("播放速度", "Playback speed")}
                  onPress={() => setShowSpeed(true)}
                  style={{ padding: 8 }}
                >
                  <Txt style={{ fontSize: 11, color: c.muted }}>
                    {audio.rate}×
                  </Txt>
                </Pressable>
              )}
            </View>
            {!compact && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  width: "100%",
                }}
              >
                <Txt style={{ fontSize: 9, color: c.muted, width: 29 }}>
                  {formatTime(audio.currentTime)}
                </Txt>
                <Slider
                  accessibilityLabel={bi("音频进度", "Audio progress")}
                  style={{ flex: 1, height: 13 }}
                  minimumValue={0}
                  maximumValue={Math.max(audio.duration, 1)}
                  value={audio.currentTime}
                  onSlidingComplete={audio.seek}
                  minimumTrackTintColor={c.green}
                  maximumTrackTintColor={c.border}
                  thumbTintColor={c.green}
                  disabled={!audio.track}
                />
                <Txt style={{ fontSize: 9, color: c.muted, width: 29 }}>
                  {formatTime(audio.duration)}
                </Txt>
              </View>
            )}
          </View>
          {!compact && (
            <View
              style={{
                flex: 0.85,
                flexDirection: "row",
                justifyContent: "flex-end",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Txt style={{ color: c.muted, fontSize: 10, marginRight: 10 }}>
                {audio.repeat !== "off"
                  ? repeatLabel
                  : bi("聆听，默想，生长", "Listen. Reflect. Grow.")}
              </Txt>
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
                onPress={() => setShowQueue(true)}
                label={bi("播放队列", "Play queue")}
                size={18}
              />
            </View>
          )}
          {compact && (
            <IconButton
              icon={ListMusic}
              onPress={() => setShowQueue(true)}
              label={bi("播放队列", "Play queue")}
              size={18}
            />
          )}
        </View>
        {compact && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
            <Txt style={{ color: c.muted, fontSize: 9 }}>
              {formatTime(audio.currentTime)}
            </Txt>
            <Slider
              accessibilityLabel={bi("音频进度", "Audio progress")}
              style={{ flex: 1, height: 13 }}
              minimumValue={0}
              maximumValue={Math.max(audio.duration, 1)}
              value={audio.currentTime}
              onSlidingComplete={audio.seek}
              minimumTrackTintColor={c.green}
              maximumTrackTintColor={c.border}
              thumbTintColor={c.green}
              disabled={!audio.track}
            />
            <Txt style={{ color: c.muted, fontSize: 9 }}>
              {formatTime(audio.duration)}
            </Txt>
            <IconButton
              icon={audio.repeat === "verse" ? Repeat1 : Repeat}
              onPress={cycleRepeat}
              label={repeatLabel}
              active={audio.repeat !== "off"}
              size={15}
              style={{ width: 29, height: 25 }}
            />
            <Pressable
              onPress={() => setShowSpeed(true)}
              accessibilityRole="button"
              accessibilityLabel={bi("播放速度", "Playback speed")}
            >
              <Txt style={{ fontSize: 10, color: c.muted }}>{audio.rate}×</Txt>
            </Pressable>
          </View>
        )}
      </View>
      <Dialog
        visible={showQueue}
        onClose={() => setShowQueue(false)}
        title={bi("接下来播放", "Up next")}
      >
        {audio.queue.length === 0 && (
          <Txt style={{ color: c.muted }}>
            {bi(
              "选择一章经文或一首诗歌，开始聆听。",
              "Choose a chapter or a hymn to start listening.",
            )}
          </Txt>
        )}
        {audio.queue.map((track, i) => (
          <Pressable
            accessibilityRole="button"
            key={track.id}
            onPress={() => audio.playQueue(audio.queue, i)}
            style={{
              flexDirection: "row",
              padding: 12,
              backgroundColor: i === audio.index ? c.lightGreen : "#fff",
              borderRadius: 10,
              gap: 14,
            }}
          >
            <Txt style={{ color: c.muted, width: 20 }}>{i + 1}</Txt>
            <View style={{ flex: 1, gap: 5 }}>
              <Txt>{track.title}</Txt>
              <Txt numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>
                {track.subtitle}
              </Txt>
            </View>
            {i === audio.index && <Check size={16} color={c.green} />}
          </Pressable>
        ))}
      </Dialog>
      <Dialog
        visible={showSpeed}
        onClose={() => setShowSpeed(false)}
        title={bi("播放速度", "Playback speed")}
      >
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
            <Pill
              key={speed}
              active={audio.rate === speed}
              onPress={() => {
                audio.setRate(speed);
                setShowSpeed(false);
              }}
            >
              {speed}×
            </Pill>
          ))}
        </View>
      </Dialog>
    </>
  );
}
