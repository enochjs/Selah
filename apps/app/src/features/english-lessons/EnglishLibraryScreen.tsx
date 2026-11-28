import { router } from "expo-router";
import {
  BookOpen,
  Check,
  ChevronRight,
  Play,
  RotateCcw,
} from "lucide-react-native";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  View,
  useWindowDimensions,
} from "react-native";
import { lessonTime, type EnglishLesson } from "../../domain/english-lessons";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Button, Eyebrow, Panel, Txt } from "../../shared/ui";
import { useEnglishProgress } from "../../state/english-lesson-progress";
import { useEnglishLessons } from "./useEnglishLessons";

const STAGES = [
  ["入门", "Beginner"],
  ["人物关系", "Relationships"],
  ["抽象思维", "Abstract thinking"],
] as const;

export function EnglishLibraryScreen() {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const { lessons, status, today, refresh } = useEnglishLessons();
  const latest = lessons[0];
  return (
    <FlatList
      data={lessons.slice(1)}
      keyExtractor={(lesson) => lesson.id}
      style={{ flex: 1 }}
      contentContainerStyle={{
        width: "100%",
        maxWidth: 736,
        alignSelf: "center",
        paddingHorizontal: width < 480 ? 20 : 32,
        paddingTop: 24,
        paddingBottom: 40,
      }}
      ListHeaderComponent={
        <View
          style={{
            gap: 20,
            marginBottom: latest && lessons.length > 1 ? 10 : 0,
          }}
        >
          <View style={{ gap: 9 }}>
            <Txt
              accessibilityRole="header"
              style={{ fontFamily: fonts.medium, fontSize: 29, lineHeight: 38 }}
            >
              {bi("情境英语", "English in context")}
            </Txt>
            <Txt style={{ color: c.textMuted, fontSize: 15, lineHeight: 23 }}>
              {bi(
                "看一段生活情境，再开口说一遍。",
                "Watch a real-life scene, then try saying it yourself.",
              )}
            </Txt>
          </View>
          {latest ? (
            <View style={{ gap: 18 }}>
              <FeaturedLesson lesson={latest} today={latest.date === today} />
              {lessons.length > 1 && (
                <Txt
                  accessibilityRole="header"
                  style={{ fontFamily: fonts.medium, fontSize: 18 }}
                >
                  {bi("往期课程", "Past lessons")}
                </Txt>
              )}
            </View>
          ) : status === "idle" || status === "loading" ? (
            <ActivityIndicator
              accessibilityLabel={bi("正在加载课程", "Loading lessons")}
              color={c.primary}
            />
          ) : (
            <Panel style={{ alignItems: "flex-start", padding: 20, gap: 12 }}>
              <BookOpen color={c.primary} size={22} strokeWidth={1.6} />
              <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
                {status === "error"
                  ? bi("暂时无法加载课程。", "Could not load lessons.")
                  : bi(
                      "新课程发布后会显示在这里。",
                      "New lessons appear here once published.",
                    )}
              </Txt>
              {status === "error" && (
                <Button secondary onPress={refresh}>
                  {bi("重试", "Retry")}
                </Button>
              )}
            </Panel>
          )}
        </View>
      }
      renderItem={({ item }) => <PastLesson lesson={item} />}
    />
  );
}

function openLesson(lesson: EnglishLesson) {
  router.push({ pathname: "/english-lesson", params: { id: lesson.id } });
}

function useLessonProgress(lesson: EnglishLesson) {
  return useEnglishProgress((state) => {
    const progress = state.progress[lesson.id];
    return progress?.revision === lesson.sha256 ? progress : undefined;
  });
}

function FeaturedLesson({
  lesson,
  today,
}: {
  lesson: EnglishLesson;
  today: boolean;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const progress = useLessonProgress(lesson);
  const [zh, en] = STAGES[lesson.stage - 1];
  const position =
    progress && progress.time > 0 && !progress.completed
      ? lessonTime(progress.time)
      : null;

  return (
    <Panel style={{ padding: 22, gap: 14, backgroundColor: c.primarySoft }}>
      <Eyebrow color={c.primary}>
        {today
          ? bi("今日课程", "TODAY’S LESSON")
          : bi("最新课程", "LATEST LESSON")}
      </Eyebrow>
      <View style={{ gap: 7 }}>
        <Txt style={{ fontFamily: fonts.serif, fontSize: 32, lineHeight: 40 }}>
          {lesson.title}
        </Txt>
        <Txt style={{ color: c.textMuted, lineHeight: 22 }}>
          {`${lesson.date} · ${bi(zh, en)} · ${lessonTime(lesson.duration)}`}
        </Txt>
      </View>
      <Button
        icon={progress?.completed ? RotateCcw : Play}
        style={{ alignSelf: "flex-start" }}
        onPress={() => openLesson(lesson)}
      >
        {progress?.completed
          ? bi("再练一次", "Practice again")
          : position
            ? bi(`继续练习 · ${position}`, `Resume · ${position}`)
            : bi("开始练习", "Start lesson")}
      </Button>
    </Panel>
  );
}

function PastLesson({ lesson }: { lesson: EnglishLesson }) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const progress = useLessonProgress(lesson);
  const state = progress?.completed
    ? bi("已练完", "Completed")
    : progress?.time
      ? bi("练习中", "In progress")
      : "";
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => openLesson(lesson)}
      style={({ hovered, pressed }) => ({
        minHeight: 68,
        flexDirection: "row",
        alignItems: "center",
        gap: 13,
        paddingHorizontal: 4,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderColor: c.border,
        backgroundColor: hovered ? c.surfaceMuted : "transparent",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
          {lesson.title}
        </Txt>
        <Txt style={{ color: c.textMuted, lineHeight: 20 }}>
          {[lesson.date, lessonTime(lesson.duration), state]
            .filter(Boolean)
            .join(" · ")}
        </Txt>
      </View>
      {progress?.completed ? (
        <Check color={c.primary} size={20} aria-hidden />
      ) : (
        <ChevronRight color={c.textMuted} size={18} aria-hidden />
      )}
    </Pressable>
  );
}
