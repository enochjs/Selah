import React, { useState, type ReactNode } from "react";
import { View, Pressable } from "react-native";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import type { DictionaryEntry } from "../../domain/dictionary";
import type { Locale } from "../../domain/models";
import { useI18n } from "../../shared/i18n";
import { fonts } from "../../shared/theme";
import { useTheme } from "../../shared/theme-context";
import { Txt, Button } from "../../shared/ui";
import { WordSources } from "./WordSources";

function meanings(entry: DictionaryEntry) {
  const types = entry.type
    .split(/[,、]/)
    .map((type) => type.trim())
    .filter(Boolean);
  return entry.meaning
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const separator = entry.language === "zh" ? "：" : ". ";
      const type = types.find((part) => line.startsWith(part + separator));
      return type
        ? { type, gloss: line.slice(type.length + separator.length) }
        : { type: "", gloss: line };
    });
}

function Disclosure({
  children,
  expanded,
  toggle,
}: {
  children: ReactNode;
  expanded: boolean;
  toggle: () => void;
}) {
  const { colors: c } = useTheme();
  const Indicator = expanded ? ChevronUp : ChevronDown;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      onPress={toggle}
      style={{
        alignSelf: "flex-start",
        alignItems: "center",
        flexDirection: "row",
        gap: 6,
        minHeight: 44,
        paddingVertical: 6,
      }}
    >
      <Txt
        style={{
          color: c.primary,
          fontFamily: fonts.medium,
          fontSize: 14,
          flexShrink: 1,
        }}
      >
        {children}
      </Txt>
      <Indicator size={14} color={c.primary} />
    </Pressable>
  );
}

export function WordDefinition({
  entry,
  status,
  retry,
  savedMeaning,
  showDetails = true,
  definitionLocale = "zh",
}: {
  entry: DictionaryEntry | null;
  status: "loading" | "found" | "missing" | "error";
  retry: () => void;
  savedMeaning?: string;
  showDetails?: boolean;
  definitionLocale?: Locale;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [alternateOpen, setAlternateOpen] = useState(false);
  const [savedOpen, setSavedOpen] = useState(false);
  const isAlternate = entry && entry.language !== definitionLocale;
  const definitions = entry ? meanings(entry) : [];
  const compact = !expanded && definitions.length > 3;
  const saved = savedMeaning?.trim();
  const savedIsAlternate =
    !!saved && /\p{Script=Han}/u.test(saved) !== (definitionLocale === "zh");
  return (
    <View style={{ gap: 10, width: "100%" }}>
      {isAlternate && (
        <View style={{ gap: 2 }}>
          <Txt style={{ color: c.textMuted, fontSize: 14, lineHeight: 22 }}>
            {definitionLocale === "zh"
              ? bi("暂无中文释义。", "No Chinese definition available.")
              : bi("暂无英文释义。", "No English definition available.")}
          </Txt>
          <Disclosure
            expanded={alternateOpen}
            toggle={() => setAlternateOpen(!alternateOpen)}
          >
            {entry.language === "en"
              ? alternateOpen
                ? bi("收起英文释义", "Hide English definition")
                : bi("查看英文释义", "View English definition")
              : alternateOpen
                ? bi("收起中文释义", "Hide Chinese definition")
                : bi("查看中文释义", "View Chinese definition")}
          </Disclosure>
        </View>
      )}
      {!!entry && (!isAlternate || alternateOpen) && (
        <View style={{ gap: 10, paddingVertical: 3 }}>
          {(compact ? definitions.slice(0, 3) : definitions).map(
            ({ type, gloss }, index) => (
              <View
                key={`${index}:${gloss}`}
                style={{
                  flexDirection: "row",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                {!!type && (
                  <Txt
                    style={{
                      color: c.textMuted,
                      fontFamily: fonts.medium,
                      fontSize: 13,
                      lineHeight: 25,
                      width: entry.language === "zh" ? 48 : undefined,
                      maxWidth: "32%",
                    }}
                  >
                    {definitions[index - 1]?.type !== type ? type : null}
                  </Txt>
                )}
                <Txt
                  style={{
                    color: c.text,
                    flex: 1,
                    fontSize: 16,
                    lineHeight: 25,
                  }}
                >
                  {gloss}
                </Txt>
              </View>
            ),
          )}
          {definitions.length > 3 && (
            <Disclosure
              expanded={expanded}
              toggle={() => setExpanded(!expanded)}
            >
              {expanded
                ? bi("收起释义", "Show fewer meanings")
                : bi("展开全部释义", "Show all meanings")}
            </Disclosure>
          )}
        </View>
      )}
      {!entry && (
        <Txt style={{ color: c.textMuted, fontSize: 14, lineHeight: 22 }}>
          {status === "loading"
            ? bi("正在查询释义…", "Looking up this word…")
            : status === "error"
              ? bi(
                  "暂时无法联网查词，请重试。",
                  "Lookup is unavailable. Try again.",
                )
              : bi(
                  "词典暂未收录这个词。",
                  "No dictionary entry for this word.",
                )}
        </Txt>
      )}
      {!entry && status === "error" && (
        <Button small secondary onPress={retry}>
          {bi("重新查词", "Retry lookup")}
        </Button>
      )}
      {!!saved && saved !== entry?.meaning && (
        <View style={{ gap: 5 }}>
          {savedIsAlternate ? (
            <Disclosure
              expanded={savedOpen}
              toggle={() => setSavedOpen(!savedOpen)}
            >
              {savedOpen
                ? bi("收起已保存的释义", "Hide saved definition")
                : bi("查看已保存的释义", "View saved definition")}
            </Disclosure>
          ) : (
            <Txt style={{ color: c.textMuted, fontSize: 13 }}>
              {bi("已保存的释义", "Saved definition")}
            </Txt>
          )}
          {(!savedIsAlternate || savedOpen) && (
            <Txt style={{ lineHeight: 25 }}>{saved}</Txt>
          )}
        </View>
      )}
      {showDetails && <WordSources entry={entry} />}
    </View>
  );
}
