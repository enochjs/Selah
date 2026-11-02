import React from "react";
import { Pressable, View } from "react-native";
import { Check } from "lucide-react-native";
import type { Locale } from "../../domain/models";
import { readingFontOptions } from "../../shared/reading-fonts";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { Txt } from "../../shared/ui";
import { useAppStore } from "../../state/app-store";

export function ReadingFontPicker({ language }: { language: Locale }) {
  const { bi } = useI18n();
  const selectedFont = useAppStore((s) => s.readingFonts[language]);
  const setReadingFont = useAppStore((s) => s.setReadingFont);
  const label =
    language === "zh"
      ? bi("中文字体", "Chinese font")
      : bi("英文字体", "English font");
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
    >
      {readingFontOptions[language].map((option) => {
        const selected = option.value === selectedFont;
        const name = bi(option.zh, option.en);
        return (
          <Pressable
            key={option.value}
            accessibilityRole="radio"
            accessibilityLabel={`${label} · ${name}`}
            accessibilityState={{ checked: selected }}
            aria-checked={selected}
            onPress={() => setReadingFont(language, option.value)}
            style={({ pressed }) => ({
              flexBasis: "45%",
              flexGrow: 1,
              minWidth: 0,
              padding: 12,
              gap: 10,
              borderWidth: 1,
              borderRadius: 10,
              borderColor: selected ? c.green : c.border,
              backgroundColor: selected ? c.lightGreen : c.paper,
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Txt
                style={{
                  fontFamily: fonts.medium,
                  fontSize: 13,
                  flex: 1,
                  color: selected ? c.green : c.ink,
                }}
              >
                {name}
              </Txt>
              {selected && <Check size={16} color={c.green} />}
            </View>
            <Txt
              style={{
                fontFamily: option.family,
                fontSize: 18,
                lineHeight: 28,
              }}
            >
              {language === "zh"
                ? "耶和华是我的牧者。"
                : "The LORD is my shepherd."}
            </Txt>
            <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
              {bi(option.description.zh, option.description.en)}
            </Txt>
          </Pressable>
        );
      })}
    </View>
  );
}
