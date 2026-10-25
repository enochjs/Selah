import React, { useState, type ReactNode } from "react";
import { View, Pressable, Linking } from "react-native";
import { Info, ChevronDown, ChevronUp } from "lucide-react-native";
import license from "@selah/content/dictionary-license.json";
import type { DictionaryEntry } from "../../domain/dictionary";
import { useI18n } from "../../shared/i18n";
import { Txt } from "../../shared/ui";
import { colors as c } from "../../shared/theme";

export function WordSources({
  entry,
  leadingAction,
}: {
  entry: DictionaryEntry | null;
  leadingAction?: ReactNode;
}) {
  const { bi } = useI18n();
  const [open, setOpen] = useState(false);
  const [showLicense, setShowLicense] = useState(false);
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: leadingAction ? "space-between" : "flex-start",
          gap: 16,
        }}
      >
        {leadingAction}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen((value) => !value)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            minHeight: 44,
          }}
        >
          <Info size={13} color={c.muted} strokeWidth={1.6} />
          <Txt style={{ color: c.muted, fontSize: 13 }}>
            {bi("来源与说明", "Sources & details")}
          </Txt>
          <Chevron size={12} color={c.muted} />
        </Pressable>
      </View>
      {open && (
        <View style={{ gap: 10, paddingBottom: 14 }}>
          {!!entry && (
            <Txt style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
              {entry.source}
              {entry.source === "ECDICT" ? " · MIT" : ""}
              {entry.language === "en"
                ? bi(" · 英文释义", " · English definition")
                : bi(" · 英汉释义", " · English–Chinese dictionary")}
            </Txt>
          )}
          <Txt style={{ fontSize: 13, color: c.muted, lineHeight: 20 }}>
            {bi(
              "发音优先使用词典录音，缺失或播放失败时使用设备合成朗读。",
              "Pronunciation uses a dictionary recording when available, with device synthesized speech as a fallback.",
            )}
          </Txt>
          {entry?.source === "ECDICT" && (
            <>
              <Pressable
                accessibilityRole="link"
                style={{ minHeight: 44, justifyContent: "center" }}
                onPress={() => {
                  void Linking.openURL(license.sourceUrl).catch(() => {});
                }}
              >
                <Txt style={{ color: c.green, fontSize: 13 }}>
                  {bi("打开 ECDICT 来源网站 ↗", "Open ECDICT website ↗")}
                </Txt>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={{ minHeight: 44, justifyContent: "center" }}
                onPress={() => setShowLicense((value) => !value)}
              >
                <Txt style={{ color: c.green, fontSize: 13 }}>
                  {showLicense
                    ? bi("收起授权全文", "Hide license")
                    : bi("在此展开 MIT 授权全文", "Expand MIT license here")}
                </Txt>
              </Pressable>
              {showLicense && (
                <Txt
                  selectable
                  style={{ fontSize: 13, color: c.muted, lineHeight: 19 }}
                >
                  {license.licenseText}
                </Txt>
              )}
            </>
          )}
          {entry?.attribution?.map((item) => (
            <Pressable
              key={item.url}
              accessibilityRole="link"
              style={{ minHeight: 44, justifyContent: "center" }}
              onPress={() => {
                void Linking.openURL(item.url).catch(() => {});
              }}
            >
              <Txt style={{ fontSize: 13, color: c.green }}>{item.name} ↗</Txt>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}
