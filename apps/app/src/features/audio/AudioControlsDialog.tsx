import React, { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView, useWindowDimensions } from "react-native";
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
import {
  audioVersionLabel,
  narrationDescription,
} from "../../data/resource-info";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Dialog, IconButton, Pill, Txt } from "../../shared/ui";
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
  onPlay?: () => void;
  initialSection?: "settings" | "queue";
}

export function AudioControlsDialog({
  visible,
  onClose,
  context,
  onLocate,
  onPlay,
  initialSection = "settings",
}: AudioControlsDialogProps) {
  const audio = useAudio();
  const { bi } = useI18n();
  const mobile = useWindowDimensions().width < 900;
  const [session, setSession] = useState({
    visible,
    entry: initialSection,
    section: initialSection,
  });
  const [pendingRepeat, setPendingRepeat] = useState<RepeatMode>(audio.repeat);
  // Reset only the panel session on a new opening; keep the Dialog host mounted through dismissal.
  if (
    visible !== session.visible ||
    (visible && initialSection !== session.entry)
  ) {
    setSession({
      visible,
      entry: initialSection,
      section: visible ? initialSection : session.section,
    });
    if (visible) setPendingRepeat(audio.repeat);
  }
  const section = session.section;
  const queueScroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const needsQueueLocate = useRef(true);
  const currentOffset = useRef<number | null>(null);
  const afterDismiss = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (visible) {
      needsQueueLocate.current = true;
      currentOffset.current = null;
      afterDismiss.current = null;
    }
  }, [visible, initialSection]);
  const selectSection = (nextSection: "settings" | "queue") => {
    needsQueueLocate.current = true;
    currentOffset.current = null;
    setSession({ ...session, section: nextSection });
  };
  const locateQueueItem = () => {
    if (
      !needsQueueLocate.current ||
      currentOffset.current === null ||
      !queueScroll.current
    )
      return;
    queueScroll.current.scrollTo({
      y: Math.max(0, currentOffset.current - 12),
      animated: false,
    });
    needsQueueLocate.current = false;
  };
  const closeThen = (action: () => void) => {
    afterDismiss.current = action;
    onClose();
  };
  const queue = context?.queue ?? audio.queue;
  const index = context?.index ?? audio.index;
  const track = queue[index];
  const current =
    !context || (track !== undefined && track.id === audio.track?.id);
  const playing = current && audio.playing;
  const repeat = current ? audio.repeat : pendingRepeat;
  const play = (selected: number) => {
    onPlay?.();
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
      presentation={mobile ? "bottom" : "center"}
      heightMode="large"
      scrollable={false}
      onDismiss={() => {
        const action = afterDismiss.current;
        afterDismiss.current = null;
        action?.();
      }}
    >
      <View
        style={{ paddingHorizontal: 20, paddingTop: 16, gap: 8, flexShrink: 0 }}
      >
        <Txt style={{ fontFamily: fonts.bold, fontSize: 16 }}>
          {context?.title ??
            track?.title ??
            bi("尚未选择音频", "No audio selected")}
        </Txt>
        {context && track && (
          <Txt style={{ color: c.muted, fontSize: 12 }}>{track.title}</Txt>
        )}
        {track?.kind === "scripture" && track.locale && (
          <Txt
            style={{
              color: c.muted,
              fontSize: typeScale.caption,
              lineHeight: 19,
            }}
          >
            {audioVersionLabel(track.locale)} ·{" "}
            {bi(narrationDescription.zh, narrationDescription.en)}
          </Txt>
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
            activeStyle="surface"
            disabled={!track}
            label={
              playing
                ? bi("暂停播放", "Pause playback")
                : bi("继续播放", "Resume playback")
            }
            onPress={() => {
              if (current) {
                onPlay?.();
                audio.toggle();
              } else play(index);
            }}
            style={{ width: 48, height: 48, borderRadius: 24 }}
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
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          paddingHorizontal: 20,
          paddingVertical: 12,
          gap: 8,
          flexShrink: 0,
        }}
      >
        <Pill
          active={section === "settings"}
          onPress={() => selectSection("settings")}
        >
          {bi("播放设置", "Playback settings")}
        </Pill>
        <Pill
          active={section === "queue"}
          onPress={() => selectSection("queue")}
        >
          {bi("播放队列", "Play queue")} · {queue.length}
        </Pill>
      </View>
      {section === "settings" ? (
        <ScrollView
          style={{ flex: 1, minHeight: 0 }}
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingBottom: 20,
            gap: 24,
          }}
        >
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
              // The web responder grows to the host height; hit slop expands the iOS 40px inner slider within these bounds.
              style={{ flex: 1, height: 44, minWidth: 44 }}
              hitSlop={{ top: 12, bottom: 12 }}
              minimumValue={0}
              maximumValue={1}
              value={audio.volume}
              onValueChange={audio.setVolume}
              minimumTrackTintColor={c.green}
              maximumTrackTintColor={c.border}
              thumbTintColor={c.green}
            />
          </View>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16 }}>
            {onLocate && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bi(
                  "返回正在聆听的内容",
                  "Go to playing content",
                )}
                style={{
                  minHeight: 44,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 6,
                }}
                onPress={() => {
                  closeThen(onLocate);
                }}
              >
                <ArrowUpRight size={15} color={c.green} />
                <Txt style={{ fontSize: typeScale.label, color: c.green }}>
                  {bi("返回内容", "Go to content")}
                </Txt>
              </Pressable>
            )}
            {track?.kind === "scripture" &&
              track.bookId &&
              track.chapter &&
              track.locale && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={bi(
                    "下载本章音频",
                    "Download this chapter",
                  )}
                  style={{
                    minHeight: 44,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                  }}
                  onPress={() => {
                    closeThen(() =>
                      router.push({
                        pathname: "/downloads",
                        params: {
                          bookId: track.bookId,
                          chapter: String(track.chapter),
                          locale: track.locale,
                        },
                      }),
                    );
                  }}
                >
                  <Download size={15} color={c.green} />
                  <Txt style={{ fontSize: typeScale.label, color: c.green }}>
                    {bi("下载本章", "Download chapter")}
                  </Txt>
                </Pressable>
              )}
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          ref={queueScroll}
          style={{ flex: 1, minHeight: 0 }}
          onLayout={locateQueueItem}
          onContentSizeChange={locateQueueItem}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
        >
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
              onLayout={
                i === index
                  ? (event) => {
                      currentOffset.current = event.nativeEvent.layout.y;
                      locateQueueItem();
                    }
                  : undefined
              }
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
                  style={{
                    fontSize: typeScale.caption,
                    lineHeight: 18,
                    color: c.muted,
                  }}
                >
                  {item.subtitle}
                </Txt>
              </View>
              {i === index && <Check size={16} color={c.green} />}
            </Pressable>
          ))}
        </ScrollView>
      )}
    </Dialog>
  );
}
