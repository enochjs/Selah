import React, { useState } from "react";
import { View, TextInput, Pressable, useWindowDimensions } from "react-native";
import {
  Plus,
  Check,
  X,
  PencilLine,
  ChevronDown,
  ChevronUp,
} from "lucide-react-native";
import { vocabularyTranslation } from "../../data/vocabulary-context";
import { useWordLookup } from "./useWordLookup";
import { WordDefinition } from "./WordDefinition";
import { WordSources } from "./WordSources";
import { WordPronunciationButton } from "./WordPronunciationButton";
import { normalizeWord } from "../../domain/vocabulary";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Dialog, Button, IconButton, inputStyle } from "../../shared/ui";
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
      key={[
        normalizeWord(selection.word),
        selection.reference,
        selection.context,
      ].join(":")}
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
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const [visible, setVisible] = useState(true);
  function close() {
    setVisible(false);
  }
  const normalized = normalizeWord(selection.word);
  const lookup = useWordLookup(normalized);
  const { entry } = lookup;
  const translation = vocabularyTranslation(
    selection.reference,
    selection.context,
  );
  const existing = useAppStore((state) =>
    state.words.find((word) => word.word === normalized),
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [noteOpen, setNoteOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const noteChanged = note.trim() !== (existing?.note ?? "").trim();
  const longContext =
    selection.context.length > 90 || (translation?.length ?? 0) > 40;
  const Chevron = contextOpen ? ChevronUp : ChevronDown;
  const addWord = useAppStore((state) => state.addWord);
  const updateWordDetails = useAppStore((state) => state.updateWordDetails);
  const notify = useAppStore((state) => state.notify);
  function save() {
    const meaning = existing?.meaning?.trim() || entry?.meaning || "";
    if (existing) {
      updateWordDetails(existing.id, meaning, note);
      if (noteChanged) notify(bi("笔记已保存", "Note saved"));
    } else {
      addWord(
        normalized,
        meaning,
        selection.reference,
        selection.context,
        note,
      );
      notify(
        bi(
          "已加入生词本，并安排首次回顾",
          "Added to your vocabulary and review schedule",
        ),
      );
    }
    close();
  }
  return (
    <Dialog
      visible={visible}
      onClose={close}
      onDismiss={onClose}
      title={normalized}
      width={480}
      presentation={mobile ? "bottom" : "center"}
      keyboardAware
      bodyStyle={{
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: noteOpen ? 20 : 0,
      }}
      header={({ onClose: closeHeader, dismissible }) => (
        <View
          style={{ paddingHorizontal: 24, paddingTop: 22, paddingBottom: 20 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Txt
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
              style={{
                flex: 1,
                fontFamily: fonts.serif,
                fontSize: 32,
                color: c.darkGreen,
              }}
            >
              {normalized}
            </Txt>
            <WordPronunciationButton word={normalized} entry={entry} compact />
            <IconButton
              icon={X}
              onPress={closeHeader}
              disabled={!dismissible}
              label={bi("关闭查词", "Close lookup")}
              size={19}
              style={{ width: 44, height: 44, marginRight: -10 }}
            />
          </View>
          {!!entry && (
            <Txt
              style={{
                color: c.muted,
                fontSize: 12,
                lineHeight: 20,
                marginTop: 5,
              }}
            >
              {[
                entry.phonetic,
                entry.type,
                entry.lemma !== normalized
                  ? bi("原形 ", "Base form ") + entry.lemma
                  : "",
              ]
                .filter(Boolean)
                .join("  ·  ")}
            </Txt>
          )}
        </View>
      )}
      footer={
        <View
          style={{
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: mobile ? 18 : 20,
          }}
        >
          <Button icon={existing ? Check : Plus} onPress={save}>
            {existing
              ? noteChanged
                ? bi("保存笔记", "Save note")
                : bi("完成", "Done")
              : bi("加入生词本", "Add to vocabulary")}
          </Button>
        </View>
      }
    >
      <WordDefinition
        {...lookup}
        savedMeaning={existing?.meaning}
        showDetails={false}
      />
      {!!selection.context && (
        <View
          style={{
            borderLeftWidth: 2,
            borderColor: "#DDE5D6",
            paddingLeft: 13,
            marginTop: 22,
            gap: 8,
          }}
        >
          <Txt
            style={{ color: c.green, fontFamily: fonts.medium, fontSize: 11 }}
          >
            {selection.reference}
          </Txt>
          <Txt
            numberOfLines={!longContext || contextOpen ? undefined : 2}
            style={{
              fontFamily: fonts.serif,
              fontSize: 14,
              lineHeight: 23,
              color: "#68735F",
            }}
          >
            {selection.context}
          </Txt>
          {!!translation && (
            <Txt
              numberOfLines={!longContext || contextOpen ? undefined : 2}
              style={{ fontSize: 13, lineHeight: 22, color: c.muted }}
            >
              {translation}
            </Txt>
          )}
          {longContext && (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: contextOpen }}
              onPress={() => setContextOpen((value) => !value)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                alignSelf: "flex-start",
                gap: 4,
                minHeight: 32,
              }}
            >
              <Txt style={{ fontSize: 11, color: c.green }}>
                {contextOpen
                  ? bi("收起原句", "Show less")
                  : bi("展开原句", "Full passage")}
              </Txt>
              <Chevron size={13} color={c.green} />
            </Pressable>
          )}
        </View>
      )}
      <View style={{ marginTop: 14 }}>
        <WordSources
          entry={entry}
          leadingAction={
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: noteOpen }}
              onPress={() => setNoteOpen((value) => !value)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                minHeight: 44,
              }}
            >
              <PencilLine size={13} color={c.muted} strokeWidth={1.6} />
              <Txt style={{ fontSize: 11, color: c.muted }}>
                {noteOpen
                  ? bi("收起笔记", "Hide note")
                  : existing?.note
                    ? bi("编辑笔记", "Edit note")
                    : bi("添加笔记", "Add note")}
              </Txt>
            </Pressable>
          }
        />
      </View>
      {noteOpen && (
        <TextInput
          accessibilityLabel={bi(
            "个人笔记（选填）",
            "Personal note (optional)",
          )}
          value={note}
          onChangeText={setNote}
          autoFocus
          multiline
          placeholder={bi(
            "记下联想或学习心得，也可以留空…",
            "An association or thought, if you like…",
          )}
          placeholderTextColor={c.muted}
          style={[
            inputStyle,
            {
              minHeight: 80,
              marginTop: 6,
              textAlignVertical: "top",
              fontSize: 13,
              lineHeight: 22,
            },
          ]}
        />
      )}
    </Dialog>
  );
}
