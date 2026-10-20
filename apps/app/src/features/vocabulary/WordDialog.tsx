import React, { useState } from "react";
import { View, TextInput } from "react-native";
import { Plus, Check, BookOpen } from "lucide-react-native";
import { dictionary } from "../../data/dictionary";
import { normalizeWord } from "../../domain/vocabulary";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Dialog, Button, Eyebrow, inputStyle } from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
export interface WordSelection {
  word: string;
  reference: string;
  context: string;
}
export function WordDialog({
  selection,
  onClose,
}: {
  selection: WordSelection | null;
  onClose: () => void;
}) {
  return selection ? (
    <WordDialogContent
      key={normalizeWord(selection.word)}
      selection={selection}
      onClose={onClose}
    />
  ) : null;
}
function WordDialogContent({
  selection,
  onClose,
}: {
  selection: WordSelection;
  onClose: () => void;
}) {
  const { bi } = useI18n();
  const normalized = normalizeWord(selection?.word ?? "");
  const entry = dictionary[normalized];
  const existing = useAppStore((s) =>
    s.words.find((w) => w.word === normalized),
  );
  const [meaning, setMeaning] = useState(
    existing?.meaning ?? entry?.meaning ?? "",
  );
  const addWord = useAppStore((s) => s.addWord),
    updateMeaning = useAppStore((s) => s.updateMeaning),
    notify = useAppStore((s) => s.notify);
  return (
    <Dialog
      visible={!!selection}
      onClose={onClose}
      title={bi("把一个词，留在心里", "Keep a word close")}
    >
      <Eyebrow>WORD BY WORD, DAY BY DAY</Eyebrow>
      <Txt style={{ fontFamily: fonts.serif, fontSize: 37, marginTop: 20 }}>
        {normalized}
      </Txt>
      <Txt style={{ color: c.muted, fontSize: 13, marginTop: 9 }}>
        {entry
          ? `${entry.phonetic}  ·  ${entry.type}`
          : bi(
              "自由释义 · 写下你理解的意思",
              "Personal definition · Make this word yours",
            )}
      </Txt>
      <View
        style={{
          backgroundColor: c.bg,
          padding: 19,
          borderRadius: 12,
          marginVertical: 24,
          gap: 10,
        }}
      >
        <BookOpen size={16} color={c.green} />
        <Txt style={{ fontFamily: fonts.serif, lineHeight: 26, fontSize: 16 }}>
          {selection?.context}
        </Txt>
        <Txt style={{ color: c.green, fontSize: 11 }}>
          {selection?.reference}
        </Txt>
      </View>
      <Txt style={{ fontSize: 12, color: c.muted, marginBottom: 9 }}>
        {bi("释义 / 笔记", "Meaning / notes")}
      </Txt>
      <TextInput
        accessibilityLabel={bi("单词释义", "Word meaning")}
        value={meaning}
        onChangeText={setMeaning}
        placeholder={bi(
          "输入中文释义或学习笔记…",
          "Add a definition or a personal note…",
        )}
        placeholderTextColor={c.muted}
        multiline
        style={[inputStyle, { minHeight: 78, textAlignVertical: "top" }]}
      />
      <Button
        style={{ marginTop: 22 }}
        icon={existing ? Check : Plus}
        onPress={() => {
          if (existing) updateMeaning(existing.id, meaning.trim());
          else
            addWord(
              normalized,
              meaning,
              selection?.reference ?? "",
              selection?.context ?? "",
            );
          notify(
            existing
              ? bi("释义已更新", "Definition updated")
              : bi(
                  "已加入生词本，并安排首次回顾",
                  "Added to your vocabulary and review schedule",
                ),
          );
          onClose();
        }}
      >
        {existing
          ? bi("保存释义", "Save definition")
          : bi("加入生词本", "Add to vocabulary")}
      </Button>
      <Txt
        style={{
          color: c.muted,
          fontSize: 10,
          textAlign: "center",
          marginTop: 14,
          lineHeight: 18,
        }}
      >
        {bi(
          "每次回顾，都是一次更深的相遇。",
          "Every review brings the Word a little closer.",
        )}
      </Txt>
    </Dialog>
  );
}
