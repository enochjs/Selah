import React, { useRef, useState } from "react";
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
  onBack,
  onSaved,
}: {
  selection: WordSelection | null;
  onClose: () => void;
  onBack?: () => void;
  onSaved?: () => void;
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
      onBack={onBack}
      onSaved={onSaved}
    />
  ) : null;
}
function WordDialogContent({
  selection,
  onClose,
  onBack,
  onSaved,
}: {
  selection: WordSelection;
  onClose: () => void;
  onBack?: () => void;
  onSaved?: () => void;
}) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const mobile = width < 760;
  const [visible, setVisible] = useState(true);
  const [confirmClose, setConfirmClose] = useState(false);
  const exitToInput = useRef(false);
  function requestClose(back = false) {
    exitToInput.current = back;
    if (noteChanged) setConfirmClose(true);
    else setVisible(false);
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
      const added = addWord(
        normalized,
        meaning,
        selection.reference,
        selection.context,
        note,
      );
      if (added) onSaved?.();
      notify(
        bi(
          "已加入生词本，并安排首次回顾",
          "Added to your vocabulary and review schedule",
        ),
      );
    }
    setVisible(false);
  }
  return (
    <Dialog
      visible={visible}
      onClose={() => requestClose()}
      onDismiss={() => {
        if (exitToInput.current && onBack) onBack();
        else onClose();
      }}
      title={normalized}
      width={480}
      presentation={mobile ? "bottom" : "center"}
      keyboardAware
      heightMode="content"
      bodyStyle={{
        paddingHorizontal: 20,
        paddingTop: 4,
        paddingBottom: noteOpen ? 20 : 0,
      }}
      header={({ onClose: closeHeader, dismissible }) => (
        <View
          style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 12 }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <Txt
              accessibilityRole="header"
              style={{
                flex: 1,
                fontFamily: fonts.serif,
                fontSize: 32,
                color: c.darkGreen,
              }}
            >
              {normalized}
            </Txt>
            <IconButton
              icon={X}
              onPress={closeHeader}
              disabled={!dismissible}
              label={bi("关闭查词", "Close lookup")}
              size={19}
              style={{ width: 44, height: 44, marginRight: -10 }}
            />
          </View>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginTop: 4,
            }}
          >
            {!!entry && (
              <Txt
                style={{
                  color: c.muted,
                  fontSize: 13,
                  lineHeight: 21,
                  flexShrink: 1,
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
                  .join(" · ")}
              </Txt>
            )}
            <WordPronunciationButton word={normalized} entry={entry} compact />
          </View>
        </View>
      )}
      footer={
        <View
          style={{
            borderTopWidth: 1,
            borderColor: c.border,
            paddingHorizontal: 20,
            paddingTop: 12,
            paddingBottom: 12,
            gap: 8,
          }}
        >
          {confirmClose ? (
            <>
              <Txt style={{ fontSize: 13, lineHeight: 20, color: c.ink }}>
                {bi("笔记有未保存的修改。", "Your note has unsaved changes.")}
              </Txt>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <Button
                  small
                  secondary
                  style={{ flex: 1 }}
                  onPress={() => {
                    exitToInput.current = false;
                    setConfirmClose(false);
                  }}
                >
                  {bi("继续编辑", "Keep editing")}
                </Button>
                <Button
                  small
                  secondary
                  style={{ flex: 1 }}
                  onPress={() => setVisible(false)}
                >
                  {bi("放弃修改", "Discard changes")}
                </Button>
              </View>
              <Button icon={existing ? Check : Plus} onPress={save}>
                {existing
                  ? bi("保存并关闭", "Save and close")
                  : bi("加入生词本并关闭", "Add to vocabulary and close")}
              </Button>
            </>
          ) : (
            <>
              <Button icon={existing ? Check : Plus} onPress={save}>
                {existing
                  ? noteChanged
                    ? bi("保存笔记", "Save note")
                    : bi("完成", "Done")
                  : bi("加入生词本", "Add to vocabulary")}
              </Button>
              {onBack && (
                <Button secondary onPress={() => requestClose(true)}>
                  {bi("返回输入", "Back to input")}
                </Button>
              )}
            </>
          )}
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
            style={{ color: c.green, fontFamily: fonts.medium, fontSize: 13 }}
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
                minHeight: 44,
              }}
            >
              <Txt style={{ fontSize: 13, color: c.green }}>
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
        {!noteOpen && !!note && (
          <Txt
            numberOfLines={2}
            style={{ fontSize: 13, lineHeight: 22, color: c.muted }}
          >
            {note}
          </Txt>
        )}
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
          <PencilLine size={14} color={c.muted} />
          <Txt style={{ fontSize: 13, color: c.muted }}>
            {noteOpen
              ? bi("收起笔记", "Hide note")
              : existing?.note
                ? bi("编辑笔记", "Edit note")
                : bi("添加笔记", "Add note")}
          </Txt>
        </Pressable>
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
      <View style={{ marginTop: 12 }}>
        <WordSources entry={entry} />
      </View>
    </Dialog>
  );
}
