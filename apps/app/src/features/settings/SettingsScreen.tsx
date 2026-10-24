import React from "react";
import { View, ScrollView, useWindowDimensions } from "react-native";
import {
  Globe2,
  Headphones,
  Type,
  CalendarDays,
  ShieldCheck,
  Sprout,
  BookOpen,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, Eyebrow, Panel, Pill } from "../../shared/ui";
import { audioVersionLabel } from "../../data/resource-info";

export function SettingsScreen() {
  const { bi, locale } = useI18n(),
    { width } = useWindowDimensions();
  const s = useAppStore();
  const mobile = width < 760;
  const rows = [
    {
      icon: Globe2,
      title: bi("界面语言", "Interface language"),
      description: bi(
        "在中文与英文之间，自由切换。",
        "Make yourself at home in Chinese or English.",
      ),
      content: (
        <>
          {(["zh", "en"] as const).map((lang) => (
            <Pill
              key={lang}
              active={locale === lang}
              onPress={() => s.setLocale(lang)}
            >
              {lang === "zh" ? "中文" : "English"}
            </Pill>
          ))}
        </>
      ),
    },
    {
      icon: BookOpen,
      title: bi("经文显示", "Scripture display"),
      description: bi(
        "单一语言，或中英对照阅读。",
        "One language, or two perspectives side by side.",
      ),
      content: (
        <>
          {(
            [
              ["parallel", bi("中英对照", "Parallel")],
              ["en", "English"],
              ["zh", "中文"],
            ] as const
          ).map(([mode, label]) => (
            <Pill
              key={mode}
              active={s.readingMode === mode}
              onPress={() => s.setReadingMode(mode)}
            >
              {label}
            </Pill>
          ))}
        </>
      ),
    },
    {
      icon: Headphones,
      title: bi("朗读语言", "Narration language"),
      description: bi(
        "下次选择经句时，按此语言播放。",
        "Used when you next select a passage to play.",
      ),
      content: (
        <>
          {(["en", "zh"] as const).map((lang) => (
            <Pill
              key={lang}
              active={s.audioLocale === lang}
              onPress={() => s.setAudioLocale(lang)}
            >
              {audioVersionLabel(lang)}
            </Pill>
          ))}
        </>
      ),
    },
    {
      icon: Type,
      title: bi("经文字号", "Reading size"),
      description: bi(
        "找到让眼睛放松的大小。",
        "Give your eyes a little breathing room.",
      ),
      content: (
        <>
          {[16, 18, 20, 23, 26].map((size) => (
            <Pill
              key={size}
              active={s.fontSize === size}
              onPress={() => s.setFontSize(size)}
            >
              {size} px
            </Pill>
          ))}
        </>
      ),
    },
    {
      icon: CalendarDays,
      title: bi("每日回顾计划", "Daily review goal"),
      description: bi(
        "每天一点积累，慢慢成为习惯。",
        "A few words, a little growth, a lasting habit.",
      ),
      content: (
        <>
          {[5, 10, 15, 20, 30].map((goal) => (
            <Pill
              key={goal}
              active={s.dailyGoal === goal}
              onPress={() => s.setDailyGoal(goal)}
            >
              {goal} {bi("词", "words")}
            </Pill>
          ))}
        </>
      ),
    },
  ];
  return (
    <ScrollView
      contentContainerStyle={{ padding: mobile ? 20 : 35, paddingBottom: 45 }}
      showsVerticalScrollIndicator={false}
    >
      <View style={{ maxWidth: 1000, width: "100%", alignSelf: "center" }}>
        <Eyebrow>MAKE THIS SPACE YOURS</Eyebrow>
        <Txt
          style={{
            fontFamily: locale === "en" ? fonts.serif : fonts.regular,
            fontSize: 32,
            marginTop: 12,
          }}
        >
          {bi("让这里，更像你的角落。", "A space that feels like you.")}
        </Txt>
        <Txt
          style={{
            color: c.muted,
            fontSize: 12,
            marginTop: 13,
            lineHeight: 23,
          }}
        >
          {bi(
            "读得舒服，听得自在，按自己的节奏生长。",
            "Read comfortably, listen freely, and grow at your own pace.",
          )}
        </Txt>
        <Panel style={{ paddingHorizontal: mobile ? 20 : 29, marginTop: 30 }}>
          {rows.map((row, i) => (
            <View
              key={i}
              style={{
                paddingVertical: 27,
                borderTopWidth: i ? 1 : 0,
                borderColor: c.border,
                flexDirection: width > 1150 ? "row" : "column",
                gap: 21,
                alignItems: width > 1150 ? "center" : "stretch",
              }}
            >
              <View style={{ flexDirection: "row", gap: 14, flex: 1 }}>
                <row.icon size={20} color={c.green} strokeWidth={1.5} />
                <View style={{ flex: 1, gap: 8 }}>
                  <Txt style={{ fontFamily: fonts.medium, fontSize: 15 }}>
                    {row.title}
                  </Txt>
                  <Txt style={{ fontSize: 11, color: c.muted, lineHeight: 19 }}>
                    {row.description}
                  </Txt>
                </View>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
                {row.content}
              </View>
            </View>
          ))}
        </Panel>
        <Panel
          style={{
            padding: 28,
            marginTop: 23,
            backgroundColor: c.lightGreen,
            borderColor: "#E0E8D7",
          }}
        >
          <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
            <ShieldCheck size={22} color={c.green} strokeWidth={1.5} />
            <Txt style={{ fontFamily: fonts.medium }}>
              {bi(
                "你的学习，留在你的设备里。",
                "Your learning stays with you.",
              )}
            </Txt>
          </View>
          <Txt
            style={{
              color: "#7E8D73",
              lineHeight: 24,
              fontSize: 12,
              marginTop: 17,
            }}
          >
            {bi(
              "经文、生词、收藏和回顾记录均在本地使用与保存，无需注册。卸载应用或清除浏览器站点数据会删除学习资料。",
              "Read, save words, and review without an account. Your library is stored on this device. Uninstalling the app or clearing site data removes local learning records.",
            )}
          </Txt>
        </Panel>
        <View style={{ alignItems: "center", marginTop: 40, gap: 10 }}>
          <Sprout size={27} color="#91A37E" strokeWidth={1.2} />
          <Txt
            style={{ fontFamily: fonts.serif, fontSize: 24, color: c.green }}
          >
            selah.
          </Txt>
        </View>
      </View>
    </ScrollView>
  );
}
