import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Pressable, type ScrollView } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { activeLyricIndex, type Lyrics } from "../../domain/lyrics";
import { formatTime } from "../../domain/playback";
import { useI18n } from "../../shared/i18n";
import { Txt } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import { LyricScrollView } from "./LyricScrollView";

export const LyricsView = React.memo(
  function LyricsView({
    lyrics,
    position,
    onPlayFrom,
  }: {
    lyrics: Lyrics;
    position: number;
    onPlayFrom: (time: number) => void;
  }) {
    const { bi } = useI18n();
    const scroll = useRef<React.ComponentRef<typeof ScrollView>>(null);
    const rows = useRef(new Map<number, { y: number; height: number }>());
    const [height, setHeight] = useState(260);
    const [browsing, setBrowsing] = useState(false);
    const current = activeLyricIndex(lyrics.lines, position);
    const locate = useCallback(
      (index = current, animated = true) => {
        const row = rows.current.get(Math.max(0, index));
        if (row)
          scroll.current?.scrollTo({
            y: Math.max(0, row.y + row.height / 2 - height / 2),
            animated,
          });
      },
      [current, height],
    );
    useEffect(() => {
      if (!browsing && lyrics.timed) locate();
      // Only a line transition or a new layout moves lyrics, never every clock tick.
    }, [browsing, lyrics, locate]);

    if (!lyrics.lines.length)
      return (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: 28,
            gap: 12,
          }}
        >
          <Txt style={{ fontSize: 20, color: c.green }}>
            {bi("暂无歌词", "No lyrics yet")}
          </Txt>
          <Txt style={{ color: c.muted, textAlign: "center", lineHeight: 23 }}>
            {bi("让旋律陪你安静片刻。", "Let the melody keep you company.")}
          </Txt>
        </View>
      );
    return (
      <View style={{ flex: 1, minHeight: 0 }}>
        <View style={{ flex: 1, minHeight: 0 }}>
          <LyricScrollView
            scrollRef={scroll}
            onBrowse={() => setBrowsing(true)}
            style={{ flex: 1, minHeight: 0 }}
            onLayout={(event) => setHeight(event.nativeEvent.layout.height)}
            onContentSizeChange={() => {
              if (!browsing && lyrics.timed) locate(current, false);
            }}
            contentContainerStyle={{
              paddingVertical: Math.max(0, height / 2 - 30),
              paddingHorizontal: 0,
            }}
            showsVerticalScrollIndicator={false}
            nestedScrollEnabled
          >
            {lyrics.lines.map((line, index) => {
              const active = lyrics.timed && index === current;
              const text = line.text || bi("♪ 间奏", "♪ Instrumental");
              const [primary, ...translation] = text.split("\n");
              const content = (
                <View style={{ gap: 8 }}>
                  <Txt
                    style={{
                      textAlign: "left",
                      fontSize: 18,
                      lineHeight: 27,
                      color: active ? c.darkGreen : c.muted,
                      fontFamily: /[a-zA-Z]/.test(primary)
                        ? fonts.serif
                        : fonts.medium,
                    }}
                  >
                    {primary}
                  </Txt>
                  {translation.length > 0 && (
                    <Txt
                      style={{
                        fontSize: 13,
                        lineHeight: 21,
                        color: active ? c.green : c.muted,
                      }}
                    >
                      {translation.join("\n")}
                    </Txt>
                  )}
                </View>
              );
              const onLayout = (event: {
                nativeEvent: { layout: { y: number; height: number } };
              }) => {
                rows.current.set(index, event.nativeEvent.layout);
                if (!browsing && lyrics.timed && index === Math.max(0, current))
                  locate(current, false);
              };
              return line.time === undefined ? (
                <View
                  key={index}
                  onLayout={onLayout}
                  style={{ paddingVertical: 14, paddingHorizontal: 18 }}
                >
                  {content}
                </View>
              ) : (
                <Pressable
                  key={index}
                  onLayout={onLayout}
                  accessibilityRole="button"
                  accessibilityLabel={bi(
                    `从 ${formatTime(line.time)} 开始唱：${text}`,
                    `Play from ${formatTime(line.time)}: ${text}`,
                  )}
                  accessibilityState={{ selected: active }}
                  onPress={() => {
                    setBrowsing(false);
                    onPlayFrom(line.time!);
                    locate(index);
                  }}
                  style={({ pressed }) => ({
                    minHeight: 56,
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    borderLeftWidth: 2,
                    borderLeftColor: active ? c.gold : "transparent",
                    opacity: active || !lyrics.timed ? 1 : 0.72,
                    borderRadius: 2,
                    backgroundColor: pressed ? c.lightGreen : "transparent",
                  })}
                >
                  {content}
                </Pressable>
              );
            })}
          </LyricScrollView>
          <LinearGradient
            pointerEvents="none"
            colors={[c.bg, `${c.bg}00`]}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 24,
            }}
          />
          <LinearGradient
            pointerEvents="none"
            colors={[`${c.bg}00`, c.bg]}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              right: 0,
              height: 32,
            }}
          />
          {browsing && lyrics.timed && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("回到当前歌词", "Return to current lyric")}
              onPress={() => {
                setBrowsing(false);
                locate();
              }}
              style={{
                position: "absolute",
                bottom: 8,
                alignSelf: "center",
                minHeight: 44,
                justifyContent: "center",
                paddingHorizontal: 16,
                borderRadius: 22,
                backgroundColor: c.lightGreen,
              }}
            >
              <Txt style={{ color: c.green, fontSize: 12 }}>
                {bi("回到当前歌词", "Follow lyrics")}
              </Txt>
            </Pressable>
          )}
        </View>
      </View>
    );
  },
  (previous, next) =>
    previous.lyrics === next.lyrics &&
    previous.onPlayFrom === next.onPlayFrom &&
    activeLyricIndex(previous.lyrics.lines, previous.position) ===
      activeLyricIndex(next.lyrics.lines, next.position),
);
