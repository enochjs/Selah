import { useEvent, useEventListener } from "expo";
import { useFocusEffect } from "expo-router";
import { useVideoPlayer, VideoView, type VideoPlayer } from "expo-video";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Platform,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Headphones,
  Lightbulb,
  MessageCircle,
  Play,
  Repeat2,
} from "lucide-react-native";
import {
  lessonTime,
  resumeLessonAt,
  type EnglishLesson,
} from "../../domain/english-lessons";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, Txt } from "../../shared/ui";
import { useEnglishProgress } from "../../state/english-lesson-progress";
import { useAudio } from "../audio/AudioProvider";

const chapters = [
  { icon: Headphones, zh: "无字幕原声", en: "Listen without subtitles" },
  { icon: Repeat2, zh: "逐句跟读", en: "Shadow the dialogue" },
  { icon: MessageCircle, zh: "情境复述", en: "Retell the scene" },
  { icon: Lightbulb, zh: "换场景练习", en: "Try a new situation" },
] as const;

// Expo Video seeks through a setter on its imperative player handle.
function seekVideo(player: VideoPlayer, time: number) {
  player.currentTime = time;
}

export function EnglishLessonVideo({
  lesson,
  uri,
}: {
  lesson: EnglishLesson;
  uri: string;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const { width, height, fontScale } = useWindowDimensions();
  const { pauseForVideo } = useAudio();
  const { id, sha256, duration } = lesson;
  const [initialTime] = useState(() =>
    resumeLessonAt(
      useEnglishProgress.getState().progress[lesson.id],
      lesson.sha256,
      lesson.duration,
    ),
  );
  const lastTime = useRef(initialTime);
  const lastSaved = useRef(initialTime);
  const restoreTime = useRef(true);
  const focus = useRef(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [activeChapter, setActiveChapter] = useState(() =>
    lesson.chapters.findLastIndex(({ start }) => start <= initialTime),
  );

  const player = useVideoPlayer(uri, (instance) => {
    instance.timeUpdateEventInterval = 0.5;
    instance.audioMixingMode = "doNotMix";
    instance.staysActiveInBackground = false;
  });
  const { status } = useEvent(player, "statusChange", {
    status: player.status,
  });

  const save = useCallback(
    (finished = false) => {
      if (finished || lastTime.current !== lastSaved.current) {
        useEnglishProgress
          .getState()
          .save({ id, sha256, duration }, lastTime.current, finished);
        lastSaved.current = lastTime.current;
      }
    },
    [id, sha256, duration],
  );

  useFocusEffect(
    useCallback(() => {
      focus.current = true;
      const subscription = AppState.addEventListener("change", (appState) => {
        if (appState === "active") return;
        // Android opens fullscreen in a separate activity. Expo Video handles
        // the native lifecycle so that transitioning to fullscreen keeps playing.
        if (Platform.OS === "web") player.pause();
        save();
      });
      return () => {
        focus.current = false;
        player.pause();
        setHasStarted(false);
        save();
        subscription.remove();
      };
    }, [player, save]),
  );

  useEffect(() => {
    if (status !== "readyToPlay" || !restoreTime.current) return;
    if (lastTime.current > 0) seekVideo(player, lastTime.current);
    restoreTime.current = false;
  }, [player, status]);

  useEventListener(player, "playingChange", ({ isPlaying }) => {
    if (isPlaying && !focus.current) player.pause();
    else if (isPlaying) {
      setHasStarted(true);
      pauseForVideo();
    } else save();
  });

  useEventListener(player, "timeUpdate", ({ currentTime }) => {
    if (!focus.current || restoreTime.current || !Number.isFinite(currentTime))
      return;
    lastTime.current = currentTime;
    setActiveChapter(
      lesson.chapters.findLastIndex(({ start }) => start <= currentTime),
    );
    if (Math.abs(currentTime - lastSaved.current) >= 5) save();
  });

  useEventListener(player, "playToEnd", () => {
    if (!focus.current) return;
    lastTime.current = lesson.duration;
    save(true);
  });

  const loading = status === "idle" || status === "loading";
  const ready = status === "readyToPlay";
  const showStart = Platform.OS === "android" && ready && !hasStarted;
  const wide = width >= 690 && fontScale < 1.35;
  const compactLandscape = width > height && height < 520;
  const videoWidth = compactLandscape
    ? (Math.max(168, height - 152) * 16) / 9
    : undefined;

  return (
    <View style={{ gap: 16 }}>
      <View
        style={{
          width: "100%",
          maxWidth: videoWidth,
          alignSelf: "center",
          aspectRatio: 16 / 9,
          borderRadius: 16,
          overflow: "hidden",
          backgroundColor: "#0C1720",
        }}
      >
        <VideoView
          player={player}
          style={{ width: "100%", height: "100%" }}
          nativeControls={!showStart && (ready || (hasStarted && loading))}
          fullscreenOptions={{ enable: true, orientation: "landscape" }}
          playsInline
          contentFit="contain"
          surfaceType="textureView"
        />
        {showStart && (
          <View
            pointerEvents="box-none"
            style={{
              position: "absolute",
              inset: 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("播放课程", "Play lesson")}
              onPress={() => {
                pauseForVideo();
                player.play();
              }}
              style={({ pressed }) => ({
                width: 60,
                height: 60,
                borderRadius: 30,
                borderWidth: 1,
                borderColor: c.scriptureDivider,
                backgroundColor: c.mediaOverlay,
                alignItems: "center",
                justifyContent: "center",
                opacity: pressed ? 0.75 : 1,
              })}
            >
              <Play
                size={24}
                color={c.onScripture}
                fill={c.onScripture}
                style={{ marginLeft: 2 }}
                aria-hidden
              />
            </Pressable>
          </View>
        )}
        {loading && !hasStarted && (
          <ActivityIndicator
            accessibilityLabel={bi("正在加载视频", "Loading video")}
            color="#FFFFFF"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
            }}
          />
        )}
        {status === "error" && (
          <View
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              alignItems: "center",
              justifyContent: "center",
              gap: 10,
              padding: 12,
            }}
          >
            <Txt style={{ color: "#FFFFFF" }}>
              {bi("暂时无法播放视频。", "Could not load the video.")}
            </Txt>
            <Button
              secondary
              onPress={() => {
                restoreTime.current = true;
                void player.replaceAsync(uri).catch(() => {});
              }}
            >
              {bi("重试", "Retry")}
            </Button>
          </View>
        )}
      </View>
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "baseline",
          gap: 12,
        }}
      >
        <Txt
          accessibilityRole="header"
          style={{ fontFamily: fonts.medium, fontSize: 16 }}
        >
          {bi("练习章节", "Lesson chapters")}
        </Txt>
        <Txt style={{ color: c.textMuted }}>{lessonTime(lesson.duration)}</Txt>
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {lesson.chapters.map(({ start }, index) => {
          const { icon: Icon, zh, en } = chapters[index];
          const active = index === activeChapter;
          const title = bi(zh, en);
          return (
            <Pressable
              key={start}
              accessibilityRole="button"
              accessibilityLabel={`${title} · ${lessonTime(start)}`}
              accessibilityState={{ selected: active, disabled: !ready }}
              aria-pressed={active}
              disabled={!ready}
              onPress={() => {
                seekVideo(player, start);
                lastTime.current = start;
                setActiveChapter(index);
                save();
              }}
              style={({ hovered, pressed }) => ({
                width: wide ? "49%" : "100%",
                minHeight: 48,
                borderWidth: 1,
                borderColor: active ? c.primary : c.border,
                borderRadius: 11,
                paddingHorizontal: 12,
                paddingVertical: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                backgroundColor: active
                  ? c.primarySoft
                  : hovered
                    ? c.surfaceMuted
                    : c.surface,
                opacity: !ready || pressed ? 0.68 : 1,
              })}
            >
              <Icon
                color={active ? c.primary : c.textMuted}
                strokeWidth={1.7}
                size={17}
                aria-hidden
              />
              <Txt
                style={{
                  flex: 1,
                  fontFamily: fonts.medium,
                  color: active ? c.primaryStrong : c.text,
                }}
              >
                {title}
              </Txt>
              <Txt
                style={{ color: c.textMuted, fontVariant: ["tabular-nums"] }}
              >
                {lessonTime(start)}
              </Txt>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
