import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react-native";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import type { EnglishLesson } from "../../domain/english-lessons";
import { englishLessonVideo } from "../../data/english-lessons";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, IconButton, Panel, Txt } from "../../shared/ui";
import { useEnglishProgress } from "../../state/english-lesson-progress";
import { EnglishLessonVideo } from "./EnglishLessonVideo";
import { useEnglishLessons } from "./useEnglishLessons";

export function EnglishLessonScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { lessons, status, refresh } = useEnglishLessons();
  const { bi } = useI18n();
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const hydrated = useEnglishProgress((state) => state.hydrated);
  const lesson = lessons.find((row) => row.id === id);
  const uri = lesson ? englishLessonVideo(lesson) : null;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: 800,
        alignSelf: "center",
        paddingHorizontal: width < 480 ? 18 : 32,
        paddingTop: 12,
        paddingBottom: 36,
        gap: 16,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 4,
          marginLeft: -8,
        }}
      >
        <IconButton
          icon={ArrowLeft}
          label={bi("返回", "Back")}
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace("/english");
          }}
        />
        <Txt style={{ fontFamily: fonts.medium, color: c.primary }}>
          {bi("情境英语", "English in context")}
        </Txt>
      </View>
      {lesson && uri && hydrated ? (
        <LessonContent
          key={`${lesson.id}:${lesson.sha256}`}
          lesson={lesson}
          uri={uri}
        />
      ) : status === "idle" || status === "loading" || !hydrated ? (
        <ActivityIndicator
          accessibilityLabel={bi("正在加载课程", "Loading lesson")}
          color={c.primary}
        />
      ) : (
        <Panel style={{ alignItems: "flex-start", padding: 20, gap: 12 }}>
          <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
            {status === "error"
              ? bi("暂时无法加载课程。", "Could not load this lesson.")
              : bi("这节课暂不可用。", "This lesson is unavailable.")}
          </Txt>
          {status === "error" && (
            <Button secondary onPress={refresh}>
              {bi("重试", "Retry")}
            </Button>
          )}
        </Panel>
      )}
    </ScrollView>
  );
}

function LessonContent({
  lesson,
  uri,
}: {
  lesson: EnglishLesson;
  uri: string;
}) {
  const { bi } = useI18n();
  const { colors: c } = useTheme();
  const [showReview, setShowReview] = useState(false);
  const [sourceError, setSourceError] = useState(false);

  return (
    <View style={{ gap: 18 }}>
      <Txt
        accessibilityRole="header"
        style={{ fontFamily: fonts.serif, fontSize: 34, lineHeight: 42 }}
      >
        {lesson.title}
      </Txt>
      <EnglishLessonVideo lesson={lesson} uri={uri} />
      <Panel style={{ paddingHorizontal: 16 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: showReview }}
          aria-expanded={showReview}
          onPress={() => setShowReview((visible) => !visible)}
          style={({ pressed }) => ({
            minHeight: 56,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
            {bi("课后回顾", "After the lesson")}
          </Txt>
          {showReview ? (
            <ChevronUp color={c.textMuted} size={18} aria-hidden />
          ) : (
            <ChevronDown color={c.textMuted} size={18} aria-hidden />
          )}
        </Pressable>
        {showReview && (
          <View style={{ gap: 14, paddingBottom: 18 }}>
            {lesson.phrases.map(({ text, purpose }, index) => (
              <View
                key={index}
                style={{
                  borderTopWidth: 1,
                  borderColor: c.border,
                  paddingTop: 12,
                  gap: 5,
                }}
              >
                <Txt
                  style={{
                    fontFamily: fonts.serif,
                    fontSize: 19,
                    lineHeight: 26,
                  }}
                >
                  {text}
                </Txt>
                <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
                  {purpose}
                </Txt>
              </View>
            ))}
            <View
              style={{
                backgroundColor: c.warmSurface,
                borderRadius: 12,
                padding: 14,
                gap: 6,
              }}
            >
              <Txt style={{ fontFamily: fonts.medium }}>
                {bi("开口练习", "Speaking practice")}
              </Txt>
              <Txt style={{ lineHeight: 22 }}>{lesson.practice}</Txt>
            </View>
          </View>
        )}
      </Panel>
      <View style={{ gap: 3 }}>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={bi(
            "查看原片与台词",
            "Open original video and transcript",
          )}
          onPress={() => {
            setSourceError(false);
            void Linking.openURL(lesson.source.url).catch(() =>
              setSourceError(true),
            );
          }}
          style={({ pressed }) => ({
            minHeight: 44,
            alignSelf: "flex-start",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingVertical: 4,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <ExternalLink color={c.primary} size={15} aria-hidden />
          <Txt style={{ color: c.primary, flexShrink: 1, lineHeight: 21 }}>
            {bi("原片", "Source")} · {lesson.source.credit}
          </Txt>
        </Pressable>
        {sourceError && (
          <Txt style={{ color: c.danger }}>
            {bi("暂时无法打开原片。", "Could not open the original video.")}
          </Txt>
        )}
      </View>
    </View>
  );
}
