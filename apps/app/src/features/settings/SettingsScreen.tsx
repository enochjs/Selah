import React, { type PropsWithChildren } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import { ChevronRight, Download, ShieldCheck } from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Txt, Panel } from "../../shared/ui";
import { useOfflineAudio } from "../downloads/OfflineAudioProvider";

function SettingGroup({
  title,
  children,
}: PropsWithChildren<{ title: string }>) {
  return (
    <View style={{ gap: 9 }}>
      <Txt
        accessibilityRole="header"
        style={{
          color: c.muted,
          fontFamily: fonts.medium,
          fontSize: 12,
          paddingLeft: 4,
        }}
      >
        {title}
      </Txt>
      <Panel style={{ paddingHorizontal: 16 }}>{children}</Panel>
    </View>
  );
}

function SettingRow({
  title,
  description,
  children,
  first = false,
  stacked = false,
}: PropsWithChildren<{
  title: string;
  description?: string;
  first?: boolean;
  stacked?: boolean;
}>) {
  return (
    <View
      style={{
        borderTopWidth: first ? 0 : 1,
        borderColor: c.border,
        paddingVertical: 16,
        flexDirection: stacked ? "column" : "row",
        alignItems: stacked ? "stretch" : "center",
        gap: stacked ? 12 : 16,
      }}
    >
      <View style={{ flex: stacked ? undefined : 1, gap: 4 }}>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 14 }}>{title}</Txt>
        {description && (
          <Txt style={{ color: c.muted, fontSize: 11, lineHeight: 17 }}>
            {description}
          </Txt>
        )}
      </View>
      {children}
    </View>
  );
}

function SettingChoices<T extends string | number>({
  label,
  value,
  options,
  onChange,
  compact = false,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  compact?: boolean;
}) {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{
        flexDirection: "row",
        backgroundColor: c.sidebar,
        borderRadius: 10,
        padding: 3,
        gap: 3,
        width: compact ? 148 : "100%",
      }}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={label + " · " + option.label}
            aria-checked={selected}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              minHeight: 38,
              paddingHorizontal: 3,
              paddingVertical: 9,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 7,
              borderWidth: 1,
              borderColor: selected ? c.border : "transparent",
              backgroundColor: selected ? c.paper : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Txt
              style={{
                fontSize: 12,
                fontFamily: selected ? fonts.bold : fonts.regular,
                color: selected ? c.green : c.muted,
              }}
            >
              {option.label}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsScreen() {
  const { bi, locale } = useI18n();
  const { width } = useWindowDimensions();
  const s = useAppStore();
  const { state: offline } = useOfflineAudio();
  const audioBytes = Object.values(offline.assets).reduce(
    (sum, asset) => sum + asset.size,
    0,
  );
  const audioSize =
    audioBytes < 1024 * 1024 * 1024
      ? (audioBytes / 1024 / 1024).toFixed(1) + " MB"
      : (audioBytes / 1024 / 1024 / 1024).toFixed(2) + " GB";
  const languages = [
    { value: "zh", label: "中文" },
    { value: "en", label: "English" },
  ] as const;

  return (
    <ScrollView
      contentContainerStyle={{
        padding: width < 760 ? 20 : 35,
        paddingBottom: 32,
      }}
      showsVerticalScrollIndicator={false}
    >
      <View
        style={{ maxWidth: 640, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <SettingGroup title={bi("语言", "Language")}>
          <SettingRow title={bi("界面语言", "Interface language")} first>
            <SettingChoices
              label={bi("界面语言", "Interface language")}
              value={locale}
              options={languages}
              onChange={s.setLocale}
              compact
            />
          </SettingRow>
          <SettingRow
            title={bi("主读语言", "Reading language")}
            description={bi("朗读也使用此语言", "Also used for narration")}
          >
            <SettingChoices
              label={bi("主读语言", "Reading language")}
              value={s.primaryLocale}
              options={languages}
              onChange={s.setPrimaryLocale}
              compact
            />
          </SettingRow>
          <SettingRow
            title={bi("显示对照文字", "Show translation")}
            description={bi(
              "在正文下方显示另一种语言",
              "The other language below the main text",
            )}
          >
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel={bi("显示对照文字", "Show translation")}
              aria-checked={s.showTranslation}
              onPress={() => s.setShowTranslation(!s.showTranslation)}
              style={({ pressed }) => ({
                minWidth: 44,
                minHeight: 44,
                justifyContent: "center",
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <View
                style={{
                  width: 44,
                  height: 26,
                  padding: 3,
                  borderRadius: 13,
                  backgroundColor: s.showTranslation ? c.green : c.border,
                  alignItems: s.showTranslation ? "flex-end" : "flex-start",
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: c.paper,
                  }}
                />
              </View>
            </Pressable>
          </SettingRow>
        </SettingGroup>

        <SettingGroup title={bi("阅读", "Reading")}>
          <SettingRow title={bi("经文字号", "Text size")} first stacked>
            <SettingChoices
              label={bi("经文字号", "Text size")}
              value={s.fontSize}
              options={[16, 18, 20, 23, 26].map((size) => ({
                value: size,
                label: String(size),
              }))}
              onChange={s.setFontSize}
            />
          </SettingRow>
          <SettingRow title={bi("经文行距", "Line spacing")} stacked>
            <SettingChoices
              label={bi("经文行距", "Line spacing")}
              value={s.lineHeight}
              options={[
                { value: 1.4, label: bi("紧凑", "Compact") },
                { value: 1.6, label: bi("标准", "Standard") },
                { value: 1.8, label: bi("宽松", "Relaxed") },
              ]}
              onChange={s.setLineHeight}
            />
          </SettingRow>
        </SettingGroup>

        <SettingGroup title={bi("学习与存储", "Learning & storage")}>
          <SettingRow
            title={bi("每日回顾词数", "Words to review each day")}
            first
            stacked
          >
            <SettingChoices
              label={bi("每日回顾词数", "Words to review each day")}
              value={s.dailyGoal}
              options={[5, 10, 15, 20, 30].map((goal) => ({
                value: goal,
                label: String(goal),
              }))}
              onChange={s.setDailyGoal}
            />
          </SettingRow>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi(
              "管理离线音频与存储空间",
              "Manage offline audio and storage",
            )}
            onPress={() => router.push("/downloads")}
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 12,
              borderTopWidth: 1,
              borderColor: c.border,
              paddingVertical: 18,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Download size={19} color={c.green} strokeWidth={1.6} />
            <View style={{ flex: 1, gap: 5 }}>
              <Txt style={{ fontFamily: fonts.medium }}>
                {bi("离线音频", "Offline audio")}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 11 }}>
                {bi("已用空间", "Storage used")} · {audioSize}
              </Txt>
            </View>
            <ChevronRight size={18} color={c.muted} strokeWidth={1.5} />
          </Pressable>
        </SettingGroup>

        <View style={{ flexDirection: "row", gap: 9, paddingHorizontal: 4 }}>
          <ShieldCheck
            size={16}
            color={c.muted}
            strokeWidth={1.5}
            style={{ marginTop: 2 }}
          />
          <View style={{ flex: 1, gap: 6 }}>
            <Txt style={{ color: c.muted, fontSize: 12 }}>
              {bi(
                "学习记录仅保存在此设备",
                "Your learning stays on this device",
              )}
            </Txt>
            <Txt style={{ color: c.muted, fontSize: 11, lineHeight: 19 }}>
              {bi(
                "无需注册。卸载应用或清除浏览器站点数据，会删除生词、收藏和回顾记录。",
                "No account needed. Uninstalling the app or clearing site data removes saved words, bookmarks, and review history.",
              )}
            </Txt>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
