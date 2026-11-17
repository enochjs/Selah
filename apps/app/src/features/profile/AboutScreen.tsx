import React from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { ArrowUpRight } from "lucide-react-native";
import { narrationDescription, resourceLinks } from "../../data/resource-info";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Panel, Txt } from "../../shared/ui";
import { useAppStore } from "../../state/app-store";
import { UpdateSettingsRow } from "../updates/UpdateSettingsRow";

export function AboutScreen() {
  const { bi, locale } = useI18n();
  const notify = useAppStore((s) => s.notify);
  return (
    <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View
        style={{ maxWidth: 640, width: "100%", alignSelf: "center", gap: 24 }}
      >
        <Txt style={{ fontSize: 28, fontFamily: fonts.medium }}>
          {bi("关于与版权", "About & credits")}
        </Txt>
        <Panel style={{ padding: 24, gap: 12 }}>
          <Txt style={{ fontFamily: fonts.serif, fontSize: 26 }}>
            selah 息语
          </Txt>
          <Txt style={{ color: c.muted, lineHeight: 24 }}>
            {bi("在神的话语中，寻得平安。", "A little stillness, every day.")}
          </Txt>
        </Panel>
        <Panel style={{ paddingHorizontal: 24 }}>
          <UpdateSettingsRow />
        </Panel>
        <Panel style={{ padding: 24, gap: 12 }}>
          <Txt style={{ fontFamily: fonts.medium, fontSize: 18 }}>
            {bi("使用统计", "Usage statistics")}
          </Txt>
          <Txt style={{ color: c.muted, lineHeight: 23 }}>
            {bi(
              "息语使用随机安装标识汇总页面访问、使用时长及公开诗歌与经文的聆听情况，帮助改善体验。记录保留 90 天，离线记录联网后补传。",
              "Selah uses a random installation identifier to summarize page visits, usage time and listening to public hymns and scripture, helping improve the experience. Records are retained for 90 days. Offline records are uploaded when connected.",
            )}
          </Txt>
        </Panel>
        <Panel style={{ padding: 24, gap: 16 }}>
          <Txt style={{ fontFamily: fonts.medium, fontSize: 18 }}>
            {bi("内容来源与授权", "Content sources & licensing")}
          </Txt>
          <Txt style={{ color: c.muted, lineHeight: 23 }}>
            {narrationDescription[locale]}
          </Txt>
          <Txt
            style={{
              color: c.muted,
              fontSize: typeScale.caption,
              lineHeight: 21,
            }}
          >
            {bi(
              "经文与录音的版权及使用条款请参阅来源网站。",
              "See the source websites for scripture and audio copyright and terms of use.",
            )}
          </Txt>
          {resourceLinks.map((link) => (
            <Pressable
              key={link.url}
              accessibilityRole="link"
              accessibilityLabel={link.title}
              onPress={() => {
                void Linking.openURL(link.url).catch(() =>
                  notify(bi("暂时无法打开链接", "Could not open the link")),
                );
              }}
              style={({ pressed }) => ({
                flexDirection: "row",
                alignItems: "center",
                gap: 12,
                minHeight: 48,
                paddingVertical: 10,
                borderTopWidth: 1,
                borderColor: c.border,
                opacity: pressed ? 0.65 : 1,
              })}
            >
              <Txt style={{ flex: 1, color: c.green, lineHeight: 23 }}>
                {link.title}
              </Txt>
              <ArrowUpRight size={17} color={c.green} />
            </Pressable>
          ))}
        </Panel>
      </View>
    </ScrollView>
  );
}
