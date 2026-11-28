import { router } from "expo-router";
import { ChevronRight, Play } from "lucide-react-native";
import { Pressable, View } from "react-native";
import { lessonTime } from "../../domain/english-lessons";
import { useI18n } from "../../shared/i18n";
import { fonts, typeScale } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt } from "../../shared/ui";
import { useEnglishProgress } from "../../state/english-lesson-progress";
import { useEnglishLessons } from "./useEnglishLessons";

export function EnglishHomeEntry() {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const { lessons, today } = useEnglishLessons();
  const latest = lessons[0];
  const progress = useEnglishProgress((state) =>
    latest ? state.progress[latest.id] : undefined,
  );
  const currentProgress =
    progress?.revision === latest?.sha256 ? progress : undefined;
  const label =
    latest?.date === today
      ? bi("今日情境英语", "Today’s English lesson")
      : bi("情境英语", "English in context");
  const detail = latest
    ? `${latest.title} · ${lessonTime(latest.duration)}`
    : bi("听原声、跟读、复述", "Listen, shadow and retell");
  const action = currentProgress?.completed
    ? bi("再练一次", "Practice again")
    : currentProgress && currentProgress.time > 0
      ? bi("继续练习", "Resume")
      : bi("开始练习", "Start");

  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`${label} · ${detail}`}
      onPress={() => {
        if (latest)
          router.push({
            pathname: "/english-lesson",
            params: { id: latest.id },
          });
        else router.push("/english");
      }}
      style={({ pressed, hovered }) => ({
        flexDirection: "row",
        alignItems: "center",
        minHeight: 76,
        gap: 12,
        paddingVertical: 13,
        paddingHorizontal: 16,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: c.border,
        backgroundColor: hovered ? c.surfaceMuted : c.warmSurface,
        opacity: pressed ? 0.72 : 1,
      })}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: c.surface,
        }}
      >
        <Play size={20} color={c.primary} strokeWidth={1.7} aria-hidden />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>{label}</Txt>
        <Txt
          style={{
            color: c.textMuted,
            fontSize: typeScale.label,
            lineHeight: 20,
          }}
        >
          {latest ? `${detail} · ${action}` : detail}
        </Txt>
      </View>
      <ChevronRight size={18} color={c.primary} aria-hidden />
    </Pressable>
  );
}
