import React, { useEffect, useRef, useState } from "react";
import {
  View,
  ScrollView,
  Pressable,
  TextInput,
  useWindowDimensions,
} from "react-native";
import { X } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Dialog, IconButton, Txt, inputStyle } from "../../shared/ui";

interface ScriptureSearchDialogProps {
  visible: boolean;
  onClose: () => void;
  onOpenVerse: (bookId: string, chapter: number, verse: number) => void;
}

export function ScriptureSearchDialog({
  visible,
  onClose,
  onOpenVerse,
}: ScriptureSearchDialogProps) {
  const { bi, locale } = useI18n();
  const mobile = useWindowDimensions().width < 900;
  const [query, setQuery] = useState("");
  const pending = useRef<{
    bookId: string;
    chapter: number;
    verse: number;
  } | null>(null);
  useEffect(() => {
    if (visible) pending.current = null;
  }, [visible]);
  const eligible = query.trim().length >= 2;
  const results = eligible ? bibleRepository.search(query) : [];
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      title={bi("搜索经文", "Search Scripture")}
      width={650}
      presentation={mobile ? "bottom" : "center"}
      heightMode="large"
      keyboardAware
      scrollable={false}
      onDismiss={() => {
        const target = pending.current;
        pending.current = null;
        if (target) onOpenVerse(target.bookId, target.chapter, target.verse);
      }}
    >
      <View style={{ paddingHorizontal: 20, paddingTop: 16, gap: 12 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          <TextInput
            accessibilityLabel={bi("搜索经文", "Search Scripture")}
            autoFocus
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            placeholder={bi(
              "输入中英文关键词，例如：平安、shepherd",
              "Search words like peace, shepherd, 平安",
            )}
            placeholderTextColor={c.muted}
            style={[inputStyle, { flex: 1, minWidth: 0 }]}
          />
          {query.length > 0 && (
            <IconButton
              icon={X}
              label={bi("清空搜索", "Clear search")}
              onPress={() => setQuery("")}
            />
          )}
        </View>
        <Txt
          accessibilityLiveRegion="polite"
          style={{
            color: c.muted,
            fontSize: typeScale.caption,
            paddingBottom: 12,
          }}
        >
          {!eligible
            ? bi(
                "搜索全部 66 卷经文，至少输入 2 个字符。",
                "Search all 66 books. Enter at least two characters.",
              )
            : bi(
                `找到 ${results.length}${results.length === 40 ? "+" : ""} 处经文`,
                `${results.length}${results.length === 40 ? "+" : ""} passages found`,
              )}
        </Txt>
      </View>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ flex: 1, minHeight: 0 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
      >
        {eligible && !results.length && (
          <Txt style={{ color: c.muted, lineHeight: 24, paddingVertical: 20 }}>
            {bi(
              "没有匹配的经文，试试其他关键词",
              "No matching verses. Try another keyword.",
            )}
          </Txt>
        )}
        {results.map((result) => {
          const reference = `${bi(result.bookZh, result.book)} ${result.chapter}:${result.verse.number}`;
          return (
            <Pressable
              key={`${result.bookId}:${result.chapter}:${result.verse.number}`}
              accessibilityRole="button"
              accessibilityLabel={bi(`阅读 ${reference}`, `Read ${reference}`)}
              onPress={() => {
                pending.current = {
                  bookId: result.bookId,
                  chapter: result.chapter,
                  verse: result.verse.number,
                };
                onClose();
              }}
              style={({ hovered }) => ({
                paddingVertical: 16,
                paddingHorizontal: 10,
                borderBottomWidth: 1,
                borderColor: c.border,
                backgroundColor: hovered ? c.lightGreen : c.paper,
                gap: 8,
              })}
            >
              <Txt
                style={{
                  fontFamily: fonts.bold,
                  color: c.green,
                  fontSize: typeScale.label,
                }}
              >
                {reference}
              </Txt>
              <Txt
                numberOfLines={2}
                style={{
                  lineHeight: 23,
                  fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                }}
              >
                {bi(result.verse.zh, result.verse.en)}
              </Txt>
            </Pressable>
          );
        })}
      </ScrollView>
    </Dialog>
  );
}
