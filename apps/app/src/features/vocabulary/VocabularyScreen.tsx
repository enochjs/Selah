import React, { useMemo, useRef, useState } from "react";
import {
  View,
  ScrollView,
  TextInput,
  Pressable,
  useWindowDimensions,
} from "react-native";
import {
  Search,
  Plus,
  ArrowUpRight,
  BookMarked,
  Trash2,
  Headphones,
  ArrowRight,
} from "lucide-react-native";
import { router } from "expo-router";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import {
  Txt,
  Panel,
  Button,
  Pill,
  IconButton,
  Dialog,
  inputStyle,
} from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import { lookupOffline } from "../../data/dictionary";
import {
  dueWords,
  normalizeWord,
  matchesSavedContext,
  selectVocabularyWords,
} from "../../domain/vocabulary";
import { WordDialog, type WordSelection } from "./WordDialog";
import { useAudio } from "../audio/AudioProvider";
import { chapterTracks } from "../audio/catalog";
import { bibleRepository } from "../../data/bible-repository";
import type { VocabularyWord } from "../../domain/models";

export function VocabularyScreen() {
  const { bi, locale } = useI18n(),
    { width } = useWindowDimensions();
  const mobile = width < 760;
  const words = useAppStore((s) => s.words),
    primaryLocale = useAppStore((s) => s.primaryLocale),
    notify = useAppStore((s) => s.notify);
  const audio = useAudio();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | "due" | "learned">("all");
  const [selection, setSelection] = useState<WordSelection | null>(null),
    [addOpen, setAddOpen] = useState(false),
    [newWord, setNewWord] = useState("");
  const pendingLookup = useRef<WordSelection | null>(null);
  const [manualLookup, setManualLookup] = useState(false);
  function submitWord() {
    const word = normalizeWord(newWord);
    if (!word || !addOpen) return;
    pendingLookup.current = { word, reference: "", context: "" };
    setAddOpen(false);
  }
  const [sort, setSort] = useState<"recent" | "az">("recent"),
    [remove, setRemove] = useState<VocabularyWord | null>(null);
  const due = dueWords(words).length,
    learned = words.filter((w) => w.repetitions >= 3).length;
  const visibleWords = useMemo(
    () => selectVocabularyWords(words, filter, query, sort),
    [words, filter, query, sort],
  );
  function playContext(word: VocabularyWord) {
    const match = /^(.*?)\s+(\d+):(\d+)$/.exec(word.reference);
    const book = match
      ? bibleRepository
          .listBooks()
          .find((b) => b.en.toLowerCase() === match[1].toLowerCase())
      : null;
    if (book && match) {
      const current = bibleRepository
        .getChapter(book.id, +match[2])
        .find((v) => v.number === +match[3]);
      if (!matchesSavedContext(word.context, current?.en ?? "")) {
        notify(
          bi(
            "译本已更新，已保留这条笔记的原句；当前录音与原句不同，暂不播放。",
            "Your saved sentence is preserved. The translation has changed, so the current audio would not match it.",
          ),
        );
        return;
      }
      const tracks = chapterTracks(book.id, +match[2], primaryLocale);
      const index = tracks.findIndex(
        (t) => t.verse === +match[3] || t.coveredVerses?.includes(+match[3]),
      );
      if (index >= 0) {
        audio.setRepeat("verse");
        audio.playQueue(tracks, index);
        return;
      }
    }
    notify(
      bi(
        "这条笔记的原句录音尚未通过定位核对，可到读经页整章聆听。",
        "This sentence has no verified verse timing yet. Listen to the chapter on the reading page.",
      ),
    );
  }
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: mobile ? 20 : 35, paddingBottom: 45 }}
    >
      <View style={{ maxWidth: 1260, width: "100%", alignSelf: "center" }}>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 11,
            marginBottom: 12,
          }}
        >
          <Txt
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 28 : 33,
            }}
          >
            {bi("生词本", "Vocabulary")}
          </Txt>
          <Button small icon={Plus} onPress={() => setAddOpen(true)}>
            {bi("添加单词", "Add word")}
          </Button>
        </View>
        <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 21 }}>
          {bi(
            "收藏单词，在回顾中慢慢熟悉。",
            "Save words and get to know them through review.",
          )}
        </Txt>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            gap: 8,
            marginVertical: 18,
          }}
        >
          {[
            bi(`已收藏 ${words.length}`, `Saved ${words.length}`),
            bi(`待回顾 ${due}`, `Due ${due}`),
            bi(`已熟悉 ${learned}`, `Familiar ${learned}`),
          ].map((label, index) => (
            <Txt key={label} style={{ fontSize: 13, color: c.muted }}>
              {index > 0 ? "·  " : ""}
              {label}
            </Txt>
          ))}
        </View>
        <Panel style={{ padding: mobile ? 15 : 23 }}>
          <View
            style={{
              flexDirection: mobile ? "column" : "row",
              alignItems: mobile ? "stretch" : "center",
              justifyContent: "space-between",
              gap: 15,
              marginBottom: 22,
            }}
          >
            <View style={{ flexDirection: "row", gap: 3 }}>
              {(
                [
                  ["all", bi("全部单词", "All words")],
                  ["due", bi("待回顾", "Due today")],
                  ["learned", bi("已熟悉", "Familiar")],
                ] as const
              ).map(([value, label]) => (
                <Pill
                  key={value}
                  active={filter === value}
                  onPress={() => setFilter(value)}
                >
                  {label}
                </Pill>
              ))}
            </View>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  borderRadius: 8,
                  backgroundColor: c.bg,
                  paddingHorizontal: 11,
                  flex: mobile ? 1 : undefined,
                }}
              >
                <Search size={14} color={c.muted} />
                <TextInput
                  accessibilityLabel={bi("搜索生词", "Search vocabulary")}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={bi("搜索单词或释义", "Search your words")}
                  placeholderTextColor={c.muted}
                  style={{
                    fontSize: 13,
                    paddingVertical: 11,
                    fontFamily: fonts.regular,
                    color: c.ink,
                    width: mobile ? undefined : 145,
                    flex: mobile ? 1 : undefined,
                  }}
                />
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={bi("切换排序", "Change word sorting")}
                onPress={() => setSort(sort === "recent" ? "az" : "recent")}
                style={{
                  padding: 9,
                  minWidth: 44,
                  minHeight: 44,
                  justifyContent: "center",
                }}
              >
                <Txt style={{ color: c.muted, fontSize: 13 }}>
                  {sort === "recent" ? bi("最近添加 ↓", "Recent ↓") : "A → Z"}
                </Txt>
              </Pressable>
            </View>
          </View>
          {visibleWords.length === 0 ? (
            <View
              style={{ alignItems: "center", paddingVertical: 60, gap: 17 }}
            >
              <BookMarked size={38} strokeWidth={1} color="#A6B396" />
              <Txt style={{ fontFamily: fonts.serif, fontSize: 20 }}>
                {words.length === 0
                  ? bi("还没有收藏单词", "No saved words yet")
                  : query.trim()
                    ? bi("没有匹配的单词", "No matching words")
                    : filter === "due"
                      ? bi("今天没有待回顾单词", "No words due today")
                      : bi("还没有已熟悉的单词", "No familiar words yet")}
              </Txt>
              <Button
                small
                secondary
                onPress={() => {
                  if (!words.length) router.push("/bible");
                  else if (query.trim()) setQuery("");
                  else {
                    setFilter("all");
                    setQuery("");
                  }
                }}
                icon={ArrowRight}
              >
                {!words.length
                  ? bi("去读经", "Read the Bible")
                  : query.trim()
                    ? bi("清除搜索", "Clear search")
                    : bi("查看全部", "View all")}
              </Button>
            </View>
          ) : (
            visibleWords.map((word) => {
              const isDue = new Date(word.dueAt) <= new Date();
              const definition = lookupOffline(word.word);
              return (
                <View
                  key={word.id}
                  style={{
                    paddingVertical: 23,
                    borderTopWidth: 1,
                    borderColor: c.border,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-start",
                      gap: 12,
                    }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => {
                          setManualLookup(false);
                          setSelection({
                            word: word.word,
                            reference: word.reference,
                            context: word.context,
                          });
                        }}
                      >
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            flexWrap: "wrap",
                            gap: 11,
                          }}
                        >
                          <Txt
                            style={{ fontFamily: fonts.serif, fontSize: 24 }}
                          >
                            {word.word}
                          </Txt>
                          <Txt style={{ color: c.muted, fontSize: 13 }}>
                            {definition?.phonetic}
                          </Txt>
                          <View
                            style={{
                              backgroundColor: isDue ? c.lightGreen : c.bg,
                              borderRadius: 5,
                              paddingHorizontal: 8,
                              paddingVertical: 4,
                            }}
                          >
                            <Txt
                              style={{
                                color: isDue ? c.green : c.muted,
                                fontSize: 13,
                              }}
                            >
                              {isDue
                                ? bi("等待回顾", "Ready to review")
                                : bi("下次 ", "Next: ") +
                                  new Date(word.dueAt).toLocaleDateString(
                                    locale === "zh" ? "zh-CN" : "en-US",
                                    { month: "short", day: "numeric" },
                                  )}
                            </Txt>
                          </View>
                        </View>
                        <Txt
                          style={{
                            color: c.muted,
                            marginTop: 11,
                            fontSize: 13,
                          }}
                        >
                          {word.meaning ||
                            definition?.meaning ||
                            bi("点击自动查词", "Tap to look up")}
                        </Txt>
                      </Pressable>
                      {!!word.note && (
                        <Txt
                          style={{
                            fontSize: 12,
                            color: c.muted,
                            marginTop: 9,
                            lineHeight: 21,
                          }}
                        >
                          {bi("笔记：", "Note: ")}
                          {word.note}
                        </Txt>
                      )}
                      {!!word.context && (
                        <View
                          style={{
                            borderLeftWidth: 2,
                            borderColor: "#DCE4D3",
                            marginTop: 17,
                            paddingLeft: 13,
                          }}
                        >
                          <Txt
                            style={{
                              fontFamily: fonts.italic,
                              color: c.muted,
                              fontSize: 13,
                              lineHeight: 24,
                            }}
                          >
                            {word.context}
                          </Txt>
                          <Txt
                            style={{
                              color: c.green,
                              fontSize: 13,
                              marginTop: 7,
                            }}
                          >
                            {word.reference}
                          </Txt>
                        </View>
                      )}
                    </View>
                    <View
                      style={{
                        flexDirection: mobile ? "column" : "row",
                        gap: 4,
                      }}
                    >
                      <IconButton
                        icon={Headphones}
                        onPress={() => playContext(word)}
                        label={bi(
                          `聆听 ${word.word} 所在经句`,
                          `Listen to the passage for ${word.word}`,
                        )}
                        size={16}
                      />
                      <IconButton
                        icon={Trash2}
                        onPress={() => setRemove(word)}
                        label={bi(`移除 ${word.word}`, `Remove ${word.word}`)}
                        size={14}
                      />
                    </View>
                  </View>
                </View>
              );
            })
          )}
        </Panel>
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/review")}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: c.lightGreen,
            padding: 23,
            borderRadius: 13,
            marginTop: 22,
          }}
        >
          <View style={{ flex: 1, gap: 7 }}>
            <Txt style={{ fontFamily: fonts.medium }}>
              {bi("让记忆，慢慢扎根。", "Let these words take root.")}
            </Txt>
            <Txt style={{ fontSize: 13, color: c.muted }}>
              {bi(
                "给自己几分钟，回顾今天的单词。",
                "Give yourself a few minutes to revisit your words.",
              )}
            </Txt>
          </View>
          <ArrowUpRight size={21} color={c.green} />
        </Pressable>
      </View>
      <WordDialog
        selection={selection}
        onClose={() => setSelection(null)}
        onSaved={manualLookup ? () => setNewWord("") : undefined}
        onBack={
          manualLookup
            ? () => {
                setSelection(null);
                setManualLookup(false);
                setAddOpen(true);
              }
            : undefined
        }
      />
      <Dialog
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={bi("添加单词", "Add word")}
        presentation={mobile ? "bottom" : "center"}
        heightMode="content"
        keyboardAware
        onDismiss={() => {
          const next = pendingLookup.current;
          pendingLookup.current = null;
          if (next) {
            setManualLookup(true);
            setSelection(next);
          }
        }}
        footer={
          <View style={{ padding: 20 }}>
            <Button
              icon={Search}
              disabled={!normalizeWord(newWord)}
              onPress={submitWord}
            >
              {bi("查看释义", "Look up word")}
            </Button>
          </View>
        }
      >
        <Txt style={{ color: c.muted, fontSize: 12, marginBottom: 9 }}>
          {bi("英文单词", "English word")}
        </Txt>
        <TextInput
          accessibilityLabel={bi("新单词", "New word")}
          value={newWord}
          onChangeText={setNewWord}
          autoCapitalize="none"
          returnKeyType="search"
          onSubmitEditing={submitWord}
          placeholder="grace"
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        <Txt
          style={{
            color: c.muted,
            fontSize: 12,
            lineHeight: 22,
            marginTop: 16,
          }}
        >
          {bi(
            "输入单词即可自动查词、听发音，再决定是否收藏。",
            "Look up a word, hear its pronunciation, then save it if you like.",
          )}
        </Txt>
      </Dialog>
      <Dialog
        visible={!!remove}
        onClose={() => setRemove(null)}
        title={bi("移除这个单词？", "Remove this word?")}
        presentation={mobile ? "bottom" : "center"}
        heightMode="content"
        footer={
          <View style={{ padding: 20, gap: 10 }}>
            <Button secondary onPress={() => setRemove(null)}>
              {bi("保留单词", "Keep word")}
            </Button>
            <Button
              style={{ backgroundColor: c.red }}
              onPress={() => {
                if (remove) useAppStore.getState().removeWord(remove.id);
                setRemove(null);
              }}
            >
              {bi("确认移除", "Remove word")}
            </Button>
          </View>
        }
      >
        <Txt style={{ color: c.muted, lineHeight: 24 }}>
          {bi(
            `「${remove?.word}」及其释义、原句和笔记将从生词本移除，不再进入回顾。历史回顾记录保留。`,
            `“${remove?.word}”, its definition, sentence and note will be removed from vocabulary and future reviews. Historical review records are kept.`,
          )}
        </Txt>
      </Dialog>
    </ScrollView>
  );
}
