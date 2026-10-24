import React, { useState } from "react";
import { View, Pressable } from "react-native";
import type { DictionaryEntry } from "../../domain/dictionary";
import { useI18n } from "../../shared/i18n";
import { Txt, Button } from "../../shared/ui";
import { WordSources } from "./WordSources";
import { colors as c } from "../../shared/theme";

export function WordDefinition({
  entry,
  status,
  retry,
  savedMeaning,
  showDetails = true,
}: {
  entry: DictionaryEntry | null;
  status: "loading" | "found" | "missing" | "error";
  retry: () => void;
  savedMeaning?: string;
  showDetails?: boolean;
}) {
  const { bi } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const long =
    !!entry &&
    (entry.meaning.length > 140 || entry.meaning.split("\n").length > 4);
  return (
    <View style={{ gap: 10, width: "100%" }}>
      {!!entry && (
        <>
          <Txt
            numberOfLines={long && !expanded ? 4 : undefined}
            style={{ fontSize: 17, lineHeight: 28, color: c.darkGreen }}
          >
            {entry.meaning}
          </Txt>
          {long && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded((value) => !value)}
              style={{ alignSelf: "flex-start", paddingVertical: 5 }}
            >
              <Txt style={{ color: c.green, fontSize: 12 }}>
                {expanded
                  ? bi("收起释义", "Show less")
                  : bi("更多释义", "More meanings")}
              </Txt>
            </Pressable>
          )}
          {entry.language === "en" && (
            <Txt style={{ fontSize: 11, color: c.muted }}>
              {bi("英文释义 · 暂无中文释义", "English definition")}
            </Txt>
          )}
        </>
      )}
      {!entry && (
        <Txt style={{ color: c.muted, fontSize: 13, lineHeight: 23 }}>
          {status === "loading"
            ? bi("正在联网查询释义…", "Looking up this word online…")
            : status === "error"
              ? bi(
                  "暂时无法联网查词，请重试。可以先收藏，稍后自动补查。",
                  "Lookup is unavailable. Retry, or save now and look it up later.",
                )
              : bi(
                  "词典暂未收录，可能是人名、地名或特殊词形。可先看下方经文对照，也可以先收藏。",
                  "No dictionary entry yet. This may be a name, place or unusual form. Check the passage translation below, or save it for later.",
                )}
        </Txt>
      )}
      {!entry && status !== "loading" && (
        <Button small secondary onPress={retry}>
          {bi("重新查词", "Retry lookup")}
        </Button>
      )}
      {!!savedMeaning?.trim() && savedMeaning.trim() !== entry?.meaning && (
        <View style={{ gap: 5 }}>
          <Txt style={{ color: c.muted, fontSize: 11 }}>
            {bi("已保存的释义", "Saved definition")}
          </Txt>
          <Txt style={{ lineHeight: 25 }}>{savedMeaning}</Txt>
        </View>
      )}
      {showDetails && <WordSources entry={entry} />}
    </View>
  );
}
