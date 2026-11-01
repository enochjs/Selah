import React, { useContext } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import {
  BookMarked,
  Bookmark,
  ChevronRight,
  Download,
  Info,
  Settings,
  Sprout,
  type LucideIcon,
} from "lucide-react-native";
import { dueWords } from "../../domain/vocabulary";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { ShellActionsContext } from "../../shared/shell-actions-context";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Panel, Txt } from "../../shared/ui";

export function ProfileScreen() {
  const { bi } = useI18n();
  const words = useAppStore((s) => s.words);
  const bookmarks = useAppStore((s) => s.bookmarks);
  const { openBookmarks } = useContext(ShellActionsContext);
  const due = dueWords(words).length;
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <View
        style={{ maxWidth: 640, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <View style={{ gap: 10, paddingVertical: 8 }}>
          <Txt style={{ fontSize: 28, fontFamily: fonts.medium }}>
            {bi("我的", "My space")}
          </Txt>
          <Txt style={{ color: c.muted, lineHeight: 22 }}>
            {bi(
              "珍藏话语，积累每一天的成长。",
              "Keep the words that help you grow.",
            )}
          </Txt>
        </View>
        <Panel style={{ paddingHorizontal: 20 }}>
          <ProfileRow
            icon={BookMarked}
            title={bi("我的词汇", "My vocabulary")}
            description={bi(
              `已收藏 ${words.length} 个单词 · 待复习 ${due} 个`,
              `${words.length} saved words · ${due} due for review`,
            )}
            onPress={() => router.push("/vocabulary")}
            first
          />
          <ProfileRow
            icon={Bookmark}
            title={bi("经文收藏", "Saved verses")}
            description={bi(
              `已收藏 ${bookmarks.length} 处经文`,
              `${bookmarks.length} saved verses`,
            )}
            onPress={openBookmarks}
          />
        </Panel>
        <Panel style={{ paddingHorizontal: 20 }}>
          <ProfileRow
            icon={Download}
            title={bi("下载管理", "Downloads")}
            description={bi("离线音频与存储空间", "Offline audio and storage")}
            onPress={() => router.push("/downloads")}
            first
          />
          <ProfileRow
            icon={Settings}
            title={bi("设置", "Settings")}
            description={bi(
              "语言、阅读外观与学习偏好",
              "Language, reading and learning preferences",
            )}
            onPress={() => router.push("/settings")}
          />
          <ProfileRow
            icon={Info}
            title={bi("关于与版权", "About & credits")}
            description={bi(
              "认识息语与内容来源",
              "About Selah and its content sources",
            )}
            onPress={() => router.push("/about")}
          />
        </Panel>
        <View
          style={{
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 10,
            paddingHorizontal: 4,
          }}
        >
          <Sprout size={18} color={c.muted} />
          <Txt
            style={{
              flex: 1,
              color: c.muted,
              fontSize: typeScale.caption,
              lineHeight: 21,
            }}
          >
            {bi(
              "学习记录仅保存在此设备，无需注册。",
              "Your learning stays on this device. No account needed.",
            )}
          </Txt>
        </View>
      </View>
    </ScrollView>
  );
}

function ProfileRow({
  icon: Icon,
  title,
  description,
  onPress,
  first = false,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  onPress: () => void;
  first?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 14,
        paddingVertical: 22,
        borderTopWidth: first ? 0 : 1,
        borderColor: c.border,
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <Icon size={21} color={c.green} strokeWidth={1.6} />
      <View style={{ flex: 1, gap: 7 }}>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>{title}</Txt>
        <Txt
          style={{
            color: c.muted,
            fontSize: typeScale.caption,
            lineHeight: 20,
          }}
        >
          {description}
        </Txt>
      </View>
      <ChevronRight size={18} color={c.muted} />
    </Pressable>
  );
}
