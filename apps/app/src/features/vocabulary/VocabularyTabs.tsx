import React from "react";
import { Pressable, View } from "react-native";
import { router } from "expo-router";
import { BookMarked, CalendarDays } from "lucide-react-native";
import { colors as c, fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { useI18n } from "../../shared/i18n";

export function VocabularyTabs({
  active,
  wordsCount,
  dueCount,
}: {
  active: "words" | "review";
  wordsCount: number;
  dueCount: number;
}) {
  const { bi } = useI18n();
  const tabs = [
    {
      id: "words",
      path: "/vocabulary",
      label: bi("生词本", "Word list"),
      icon: BookMarked,
      count: wordsCount,
    },
    {
      id: "review",
      path: "/review",
      label: bi("回顾", "Review"),
      icon: CalendarDays,
      count: dueCount,
    },
  ] as const;
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "center",
        padding: 10,
        borderBottomWidth: 1,
        borderBottomColor: c.border,
      }}
    >
      <View
        style={{
          flexDirection: "row",
          padding: 3,
          borderRadius: 12,
          backgroundColor: c.sidebar,
        }}
      >
        {tabs.map(({ id, path, label, icon: Icon, count }) => (
          <Pressable
            key={id}
            accessibilityRole="link"
            accessibilityLabel={label}
            accessibilityState={{ selected: active === id }}
            onPress={() => router.replace(path)}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              minHeight: 42,
              minWidth: 122,
              paddingHorizontal: 16,
              borderRadius: 9,
              backgroundColor: active === id ? c.paper : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon size={15} color={active === id ? c.green : c.muted} />
            <Txt
              style={{
                fontSize: 12,
                fontFamily: active === id ? fonts.bold : fonts.regular,
                color: active === id ? c.green : c.muted,
              }}
            >
              {label}
            </Txt>
            <Txt style={{ fontSize: 10, color: c.muted }}>{count}</Txt>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
