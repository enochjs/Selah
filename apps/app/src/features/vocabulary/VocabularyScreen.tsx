import React, { useMemo, useState } from "react";
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
  CalendarDays,
  Sprout,
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
  Eyebrow,
  IconButton,
  Dialog,
  inputStyle,
} from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import { dictionary } from "../../data/dictionary";
import { dueWords, matchesSavedContext } from "../../domain/vocabulary";
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
    audioLocale = useAppStore((s) => s.audioLocale),
    notify = useAppStore((s) => s.notify);
  const audio = useAudio();
  const [query, setQuery] = useState(""),
    [filter, setFilter] = useState<"all" | "due" | "learned">("all");
  const [selection, setSelection] = useState<WordSelection | null>(null),
    [addOpen, setAddOpen] = useState(false),
    [newWord, setNewWord] = useState(""),
    [meaning, setMeaning] = useState("");
  const [sort, setSort] = useState<"recent" | "az">("recent"),
    [remove, setRemove] = useState<VocabularyWord | null>(null);
  const due = dueWords(words).length,
    learned = words.filter((w) => w.repetitions >= 3).length;
  const visibleWords = useMemo(() => {
    const dueSet = new Set(dueWords(words).map((w) => w.id));
    const result = words.filter(
      (w) =>
        (filter === "all" ||
          (filter === "due" ? dueSet.has(w.id) : w.repetitions >= 3)) &&
        `${w.word} ${w.meaning} ${w.reference}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
    return sort === "az"
      ? result.toSorted((a, b) => a.word.localeCompare(b.word))
      : result.toSorted((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [words, filter, query, sort]);
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
      const tracks = chapterTracks(book.id, +match[2], audioLocale);
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
        <Eyebrow>COLLECT WORDS. CULTIVATE UNDERSTANDING.</Eyebrow>
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
            {bi("一个词，一点生长。", "Words worth keeping.")}
          </Txt>
          <Button small icon={Plus} onPress={() => setAddOpen(true)}>
            {bi("添加单词", "Add word")}
          </Button>
        </View>
        <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 21 }}>
          {bi(
            "收藏读经时的每一次发现，让陌生的单词，成为熟悉的朋友。",
            "Every word is a little discovery. Keep it, revisit it, make it yours.",
          )}
        </Txt>
        <View
          style={{
            flexDirection: "row",
            gap: mobile ? 10 : 18,
            marginTop: 29,
            marginBottom: 28,
          }}
        >
          {[
            {
              label: bi("已收藏的单词", "Words collected"),
              value: words.length,
              icon: BookMarked,
              bg: c.lightGreen,
              color: c.green,
            },
            {
              label: bi("等待今日回顾", "Ready to review"),
              value: due,
              icon: CalendarDays,
              bg: c.sand,
              color: c.gold,
            },
            {
              label: bi("正在扎根生长", "Taking root"),
              value: learned,
              icon: Sprout,
              bg: "#EAF0F1",
              color: c.blue,
            },
          ].map((item) => (
            <Panel
              key={item.label}
              style={{ flex: 1, padding: mobile ? 14 : 23, gap: 15 }}
            >
              <View
                style={{
                  flexDirection: mobile ? "column" : "row",
                  alignItems: mobile ? "flex-start" : "center",
                  gap: 14,
                }}
              >
                <View
                  style={{
                    padding: 10,
                    borderRadius: 10,
                    backgroundColor: item.bg,
                  }}
                >
                  <item.icon size={19} color={item.color} strokeWidth={1.5} />
                </View>
                <Txt style={{ fontFamily: fonts.serif, fontSize: 29 }}>
                  {item.value}
                </Txt>
              </View>
              <Txt style={{ color: c.muted, fontSize: mobile ? 10 : 12 }}>
                {item.label}
              </Txt>
            </Panel>
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
                  ["learned", bi("已熟悉", "Taking root")],
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
                    fontSize: 11,
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
                style={{ padding: 9 }}
              >
                <Txt style={{ color: c.muted, fontSize: 10 }}>
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
                {bi(
                  "为新的发现，留一点空间。",
                  "Make room for a new discovery.",
                )}
              </Txt>
              <Txt style={{ color: c.muted, fontSize: 12 }}>
                {query
                  ? bi(
                      "没有匹配的单词，试试其他关键词。",
                      "No matching words. Try another search.",
                    )
                  : bi(
                      "点击经文里的英文单词，即可收藏。",
                      "Tap an English word while reading to save it.",
                    )}
              </Txt>
              <Button
                small
                secondary
                onPress={() => router.push("/")}
                icon={ArrowRight}
              >
                {bi("去读一段经文", "Read a little")}
              </Button>
            </View>
          ) : (
            visibleWords.map((word) => {
              const isDue = new Date(word.dueAt) <= new Date();
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
                        onPress={() =>
                          setSelection({
                            word: word.word,
                            reference: word.reference,
                            context: word.context,
                          })
                        }
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
                          <Txt style={{ color: c.muted, fontSize: 11 }}>
                            {dictionary[word.word]?.phonetic}
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
                                fontSize: 9,
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
                            color: "#78816E",
                            marginTop: 11,
                            fontSize: 13,
                          }}
                        >
                          {word.meaning ||
                            bi("点击补充释义", "Tap to add a definition")}
                        </Txt>
                      </Pressable>
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
                              color: "#969B8C",
                              fontSize: 13,
                              lineHeight: 24,
                            }}
                          >
                            {word.context}
                          </Txt>
                          <Txt
                            style={{
                              color: c.green,
                              fontSize: 10,
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
            <Txt style={{ fontSize: 11, color: "#859078" }}>
              {bi(
                "给自己几分钟，回顾今天的单词。",
                "Give yourself a few minutes to revisit your words.",
              )}
            </Txt>
          </View>
          <ArrowUpRight size={21} color={c.green} />
        </Pressable>
      </View>
      <WordDialog selection={selection} onClose={() => setSelection(null)} />
      <Dialog
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        title={bi("收藏一个新单词", "A new word to keep")}
      >
        <Txt style={{ color: c.muted, fontSize: 12, marginBottom: 9 }}>
          {bi("英文单词", "English word")}
        </Txt>
        <TextInput
          accessibilityLabel={bi("新单词", "New word")}
          value={newWord}
          onChangeText={setNewWord}
          autoCapitalize="none"
          placeholder="grace"
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        <Txt
          style={{
            color: c.muted,
            fontSize: 12,
            marginBottom: 9,
            marginTop: 23,
          }}
        >
          {bi("释义 / 笔记", "Meaning / notes")}
        </Txt>
        <TextInput
          accessibilityLabel={bi("新单词释义", "New word meaning")}
          value={meaning}
          onChangeText={setMeaning}
          placeholder={bi("恩典；优雅", "A little note to help you remember")}
          placeholderTextColor={c.muted}
          style={inputStyle}
        />
        <Button
          icon={Plus}
          disabled={!newWord.trim()}
          style={{ marginTop: 25 }}
          onPress={() => {
            const added = useAppStore
              .getState()
              .addWord(
                newWord,
                meaning ||
                  dictionary[newWord.toLowerCase().trim()]?.meaning ||
                  "",
                "",
                "",
              );
            if (!added) {
              notify(
                bi(
                  "这个单词已经收藏过了，或输入为空。",
                  "This word is already saved, or the input is empty.",
                ),
              );
              return;
            }
            setAddOpen(false);
            setNewWord("");
            setMeaning("");
            notify(
              bi(
                "已收藏，并加入回顾计划",
                "Saved and added to your review plan",
              ),
            );
          }}
        >
          {bi("加入生词本", "Add to vocabulary")}
        </Button>
      </Dialog>
      <Dialog
        visible={!!remove}
        onClose={() => setRemove(null)}
        title={bi("移除这个单词？", "Remove this word?")}
      >
        <Txt style={{ color: c.muted, lineHeight: 24 }}>
          {bi(
            `「${remove?.word}」将从生词本和回顾计划中移除。`,
            `“${remove?.word}” will be removed from your vocabulary and review plan.`,
          )}
        </Txt>
        <Button
          style={{ marginTop: 24 }}
          onPress={() => {
            if (remove) useAppStore.getState().removeWord(remove.id);
            setRemove(null);
          }}
        >
          {bi("确认移除", "Remove word")}
        </Button>
      </Dialog>
    </ScrollView>
  );
}
