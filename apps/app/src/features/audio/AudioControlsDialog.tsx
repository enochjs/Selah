import React, { useState } from "react";
import { View, Pressable } from "react-native";
import { router } from "expo-router";
import Slider from "@react-native-community/slider";
import {
  ArrowUpRight,
  Check,
  Download,
  Pause,
  Play,
  SkipBack,
  SkipForward,
} from "lucide-react-native";
import type { AudioTrack, RepeatMode } from "../../domain/models";
import { nextTrackIndex } from "../../domain/playback";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Button, Dialog, IconButton, Pill, Txt } from "../../shared/ui";
import { useAudio } from "./AudioProvider";

export interface PlaybackContext {
  title: string;
  queue: AudioTrack[];
  index: number;
}

interface AudioControlsDialogProps {
  visible: boolean;
  onClose: () => void;
  context?: PlaybackContext;
  onLocate?: () => void;
}

export function AudioControlsDialog(props: AudioControlsDialogProps) {
  return props.visible ? (
    <PlaybackControls key={props.context?.title ?? "current"} {...props} />
  ) : null;
}

function PlaybackControls({
  visible,
  onClose,
  context,
  onLocate,
}: AudioControlsDialogProps) {
  const audio = useAudio();
  const { bi } = useI18n();
  const [pendingRepeat, setPendingRepeat] = useState<RepeatMode>("off");
  const queue = context?.queue ?? audio.queue;
  const index = context?.index ?? audio.index;
  const track = queue[index];
  const current =
    !context || (track !== undefined && track.id === audio.track?.id);
  const playing = current && audio.playing;
  const repeat = current ? audio.repeat : pendingRepeat;
  const play = (selected: number) => {
    audio.setRepeat(repeat);
    audio.playQueue(queue, selected);
  };
  const next = nextTrackIndex(
    index,
    queue.length,
    repeat === "verse" ? "off" : repeat,
  );
  const wholeChapter = track?.kind === "scripture" && track.verse === undefined;
  const modes: { value: RepeatMode; label: string }[] = [
    { value: "off", label: bi("顺序播放", "Repeat off") },
    ...(!wholeChapter
      ? [
          {
            value: "verse" as const,
            label:
              track?.kind === "hymn"
                ? bi("单曲循环", "Repeat track")
                : bi("单句循环", "Repeat verse"),
          },
        ]
      : []),
    {
      value: "chapter",
      label:
        track?.kind === "hymn"
          ? bi("列表循环", "Repeat queue")
          : bi("整章循环", "Repeat chapter"),
    },
  ];
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={bi("播放控制", "Playback controls")}
    >
      <View style={{ gap: 24 }}>
        <View style={{ gap: 8 }}>
          <Txt style={{ fontFamily: fonts.bold, fontSize: 16 }}>
            {context?.title ??
              track?.title ??
              bi("尚未选择音频", "No audio selected")}
          </Txt>
          {context && track && (
            <Txt style={{ color: c.muted, fontSize: 12 }}>{track.title}</Txt>
          )}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "center",
              alignItems: "center",
              gap: 24,
              marginTop: 8,
            }}
          >
            <IconButton
              icon={SkipBack}
              disabled={!track}
              label={bi("上一节或上一曲", "Previous verse or track")}
              onPress={() =>
                context ? play(Math.max(0, index - 1)) : audio.previous()
              }
            />
            <IconButton
              icon={playing ? Pause : Play}
              active={playing}
              disabled={!track}
              label={
                playing
                  ? bi("暂停播放", "Pause playback")
                  : bi("继续播放", "Resume playback")
              }
              onPress={() => (current ? audio.toggle() : play(index))}
              style={{ width: 48, height: 48 }}
            />
            <IconButton
              icon={SkipForward}
              disabled={next === null}
              label={bi("下一节或下一曲", "Next verse or track")}
              onPress={() => {
                if (context) {
                  if (next !== null) play(next);
                } else audio.next();
              }}
            />
          </View>
        </View>
        {onLocate && (
          <Button
            secondary
            small
            icon={ArrowUpRight}
            onPress={() => {
              onClose();
              onLocate();
            }}
          >
            {bi("返回正在聆听的内容", "Go to playing content")}
          </Button>
        )}
        {track?.kind === "scripture" &&
          track.bookId &&
          track.chapter &&
          track.locale && (
            <Button
              secondary
              small
              icon={Download}
              onPress={() => {
                onClose();
                router.push({
                  pathname: "/downloads",
                  params: {
                    bookId: track.bookId,
                    chapter: String(track.chapter),
                    locale: track.locale,
                  },
                });
              }}
            >
              {bi("下载本章音频", "Download this chapter")}
            </Button>
          )}
        <View style={{ gap: 8 }}>
          <Txt style={{ color: c.muted, fontSize: 12 }}>
            {bi("播放速度", "Playback speed")}
          </Txt>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {[0.5, 0.75, 1, 1.25, 1.5, 2].map((rate) => (
              <Pill
                key={rate}
                active={audio.rate === rate}
                onPress={() => audio.setRate(rate)}
              >
                {rate}×
              </Pill>
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Txt style={{ color: c.muted, fontSize: 12 }}>
            {bi("循环方式", "Repeat mode")}
          </Txt>
          {context && !current && (
            <Txt style={{ color: c.muted, fontSize: 12 }}>
              {bi(
                "应用于本节开始播放时",
                "Applies when this passage starts playing",
              )}
            </Txt>
          )}
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {modes.map((mode) => (
              <Pill
                key={mode.value}
                active={repeat === mode.value}
                onPress={() =>
                  current
                    ? audio.setRepeat(mode.value)
                    : setPendingRepeat(mode.value)
                }
              >
                {mode.label}
              </Pill>
            ))}
          </View>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Txt style={{ color: c.muted, fontSize: 12 }}>
            {bi("音量", "Volume")}
          </Txt>
          <Slider
            accessibilityLabel={bi("播放音量", "Playback volume")}
            style={{ flex: 1 }}
            minimumValue={0}
            maximumValue={1}
            value={audio.volume}
            onValueChange={audio.setVolume}
            minimumTrackTintColor={c.green}
            maximumTrackTintColor={c.border}
            thumbTintColor={c.green}
          />
        </View>
        <View style={{ gap: 8 }}>
          <Txt style={{ color: c.muted, fontSize: 12 }}>
            {bi("播放队列", "Play queue")}
          </Txt>
          {!queue.length && (
            <Txt style={{ fontSize: 12, color: c.muted }}>
              {bi(
                "选择一段经文或一首诗歌，开始聆听。",
                "Choose a passage or a hymn to start listening.",
              )}
            </Txt>
          )}
          {queue.map((item, i) => (
            <Pressable
              key={item.id}
              accessibilityRole="button"
              accessibilityLabel={bi(
                `播放 ${item.title}`,
                `Play ${item.title}`,
              )}
              accessibilityState={{ selected: i === index }}
              onPress={() => {
                play(i);
                onClose();
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                padding: 12,
                borderRadius: 10,
                backgroundColor: i === index ? c.lightGreen : "transparent",
              }}
            >
              <Txt style={{ color: c.muted, width: 20, fontSize: 12 }}>
                {i + 1}
              </Txt>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt style={{ fontSize: 13 }}>{item.title}</Txt>
                <Txt
                  numberOfLines={2}
                  style={{ fontSize: 11, lineHeight: 18, color: c.muted }}
                >
                  {item.subtitle}
                </Txt>
              </View>
              {i === index && <Check size={16} color={c.green} />}
            </Pressable>
          ))}
        </View>
      </View>
    </Dialog>
  );
}
