import React, { useState } from "react";
import { View, ScrollView, Pressable, useWindowDimensions } from "react-native";
import { router } from "expo-router";
import {
  ArrowRight,
  Check,
  Sprout,
  CalendarDays,
  Eye,
  X,
  Settings2,
  BookOpen,
} from "lucide-react-native";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import {
  Txt,
  Eyebrow,
  Button,
  Panel,
  Pill,
  Dialog,
  IconButton,
} from "../../shared/ui";
import { colors as c, fonts } from "../../shared/theme";
import {
  reviewQueue,
  dueWords,
  forecast,
  localDateKey,
  scheduleReview,
} from "../../domain/vocabulary";
import { useNow } from "../../shared/useNow";
import { dictionary } from "../../data/dictionary";
import type { ReviewRating } from "../../domain/models";

export function ReviewScreen() {
  const { bi, locale } = useI18n(),
    { width } = useWindowDimensions();
  const mobile = width < 760;
  const now = useNow();
  const words = useAppStore((s) => s.words),
    reviews = useAppStore((s) => s.reviews),
    dailyGoal = useAppStore((s) => s.dailyGoal);
  const [session, setSession] = useState<string[] | null>(null),
    [position, setPosition] = useState(0),
    [revealed, setRevealed] = useState(false),
    [goalOpen, setGoalOpen] = useState(false);
  const reviewedToday = new Set(
    reviews
      .filter(
        (r) =>
          r.rating !== "again" &&
          localDateKey(new Date(r.at)) === localDateKey(now),
      )
      .map((r) => r.wordId),
  ).size;
  const remaining = Math.max(0, dailyGoal - reviewedToday),
    due = dueWords(words, now).length;
  const queue = reviewQueue(words, reviews, dailyGoal, now),
    days = forecast(words, now),
    card = session ? words.find((w) => w.id === session[position]) : null;
  const finished = session !== null && (position >= session.length || !card);
  const weekReviews = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - 6 + i);
    const key = localDateKey(d);
    return {
      date: d,
      count: new Set(
        reviews
          .filter((r) => localDateKey(new Date(r.at)) === key)
          .map((r) => r.wordId),
      ).size,
    };
  });
  function start() {
    if (!queue.length) return;
    setSession(queue.map((w) => w.id));
    setPosition(0);
    setRevealed(false);
  }
  function grade(rating: ReviewRating) {
    if (!card) return;
    useAppStore.getState().reviewWord(card.id, rating);
    setPosition((p) => p + 1);
    setRevealed(false);
  }
  function intervalLabel(rating: ReviewRating) {
    if (!card) return "";
    if (rating === "again") return bi("10 分钟后", "10 minutes");
    const next = scheduleReview(card, rating);
    return bi(
      `${next.interval} 天后`,
      `${next.interval} day${next.interval > 1 ? "s" : ""}`,
    );
  }
  const maxForecast = Math.max(5, ...days.map((d) => d.count));
  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ padding: mobile ? 20 : 35, paddingBottom: 45 }}
    >
      <View style={{ maxWidth: 1160, width: "100%", alignSelf: "center" }}>
        <Eyebrow>GROW A LITTLE, EVERY DAY.</Eyebrow>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 11,
            marginBottom: 12,
            gap: 10,
          }}
        >
          <Txt
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 27 : 33,
            }}
          >
            {bi("温故，让话语扎根。", "A little practice. Deeper roots.")}
          </Txt>
          <IconButton
            icon={Settings2}
            onPress={() => setGoalOpen(true)}
            label={bi("设置每日计划", "Set daily review plan")}
          />
        </View>
        <Txt style={{ fontSize: 12, color: c.muted, lineHeight: 22 }}>
          {bi(
            "不必急着记住一切。让每一次重逢，成为更深一点的理解。",
            "No need to remember everything at once. Understanding grows with every return.",
          )}
        </Txt>
        {session === null ? (
          <>
            <Panel
              style={{
                backgroundColor: c.lightGreen,
                borderColor: "#DEE7D4",
                padding: mobile ? 25 : 37,
                marginTop: 28,
                flexDirection: mobile ? "column" : "row",
                alignItems: mobile ? "flex-start" : "center",
                gap: 28,
              }}
            >
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 7 }}
                >
                  <Sprout size={17} color={c.green} />
                  <Eyebrow color={c.green}>
                    {bi("今日的温柔坚持", "YOUR MOMENT OF GROWTH")}
                  </Eyebrow>
                </View>
                <Txt
                  style={{
                    fontFamily: fonts.serif,
                    fontSize: mobile ? 32 : 43,
                    color: c.darkGreen,
                    marginVertical: 18,
                  }}
                >
                  {queue.length > 0
                    ? bi(
                        `${queue.length} 个单词，几分钟光阴。`,
                        `${queue.length} words. A few quiet minutes.`,
                      )
                    : bi("此刻，安心歇一歇。", "All caught up. Take a breath.")}
                </Txt>
                <Txt style={{ color: "#7C8C70", fontSize: 12, lineHeight: 23 }}>
                  {queue.length > 0
                    ? bi(
                        "先试着回忆，再揭晓释义，诚实地告诉自己记得多少。",
                        "Recall first, reveal the meaning, then tell us how it felt.",
                      )
                    : due > 0 && !remaining
                      ? bi(
                          "今日目标已完成。可以在计划设置中增加每日数量。",
                          "Today’s goal is complete. You can increase your daily goal in settings.",
                        )
                      : bi(
                          "新的单词或到期的回顾，会在这里等你。",
                          "New words and upcoming reviews will be waiting here.",
                        )}
                </Txt>
              </View>
              <View style={{ minWidth: mobile ? undefined : 172, gap: 11 }}>
                {queue.length > 0 ? (
                  <Button icon={ArrowRight} onPress={start}>
                    {bi("开始今日回顾", "Begin your review")}
                  </Button>
                ) : (
                  <Button
                    secondary
                    icon={BookOpen}
                    onPress={() => router.push("/")}
                  >
                    {bi("回到经文", "Return to the Word")}
                  </Button>
                )}
                <Txt
                  style={{
                    fontSize: 10,
                    color: "#8A967F",
                    textAlign: "center",
                  }}
                >
                  {bi(
                    `今日已回顾 ${reviewedToday} / ${dailyGoal} 个单词`,
                    `${reviewedToday} of ${dailyGoal} words reviewed today`,
                  )}
                </Txt>
              </View>
            </Panel>
            <View
              style={{
                flexDirection: mobile ? "column" : "row",
                gap: 21,
                marginTop: 24,
              }}
            >
              <Panel style={{ flex: 1.6, padding: mobile ? 21 : 27 }}>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View style={{ gap: 7 }}>
                    <Eyebrow>YOUR NEXT SEVEN DAYS</Eyebrow>
                    <Txt style={{ fontSize: 19, fontFamily: fonts.medium }}>
                      {bi("未来一周的回顾", "A week of small steps")}
                    </Txt>
                  </View>
                  <CalendarDays size={21} color={c.green} strokeWidth={1.4} />
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    height: 176,
                    marginTop: 27,
                    gap: mobile ? 8 : 15,
                    alignItems: "flex-end",
                  }}
                >
                  {days.map((day, i) => (
                    <View
                      key={i}
                      style={{
                        flex: 1,
                        alignItems: "center",
                        height: "100%",
                        justifyContent: "flex-end",
                        gap: 10,
                      }}
                    >
                      <Txt
                        style={{
                          fontSize: 11,
                          color: i === 0 ? c.green : c.muted,
                        }}
                      >
                        {day.count}
                      </Txt>
                      <View
                        style={{
                          width: "100%",
                          maxWidth: 40,
                          minHeight: 5,
                          height: Math.max(5, (day.count / maxForecast) * 113),
                          backgroundColor: i === 0 ? "#70875D" : "#E3EAD9",
                          borderRadius: 6,
                        }}
                      />
                      <Txt
                        style={{
                          fontSize: 10,
                          color: i === 0 ? c.green : c.muted,
                        }}
                      >
                        {i === 0
                          ? bi("今天", "Today")
                          : day.date.toLocaleDateString(
                              locale === "zh" ? "zh-CN" : "en-US",
                              { weekday: "short" },
                            )}
                      </Txt>
                      <Txt style={{ fontSize: 9, color: "#A2A895" }}>
                        {day.date.getMonth() + 1}/{day.date.getDate()}
                      </Txt>
                    </View>
                  ))}
                </View>
                <Txt
                  style={{
                    color: "#A0A594",
                    fontSize: 10,
                    lineHeight: 18,
                    marginTop: 23,
                  }}
                >
                  {bi(
                    "日历根据当前到期时间显示；完成回顾后会自动更新。",
                    "Based on current due dates. Your schedule adapts after every review.",
                  )}
                </Txt>
              </Panel>
              <Panel style={{ flex: 1, padding: mobile ? 21 : 27 }}>
                <Eyebrow>STEADY, NOT HURRIED.</Eyebrow>
                <Txt
                  style={{
                    fontFamily: fonts.medium,
                    fontSize: 19,
                    marginTop: 8,
                  }}
                >
                  {bi("适合你的节奏", "Find your rhythm")}
                </Txt>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "baseline",
                    gap: 7,
                    marginTop: 27,
                  }}
                >
                  <Txt
                    style={{
                      fontFamily: fonts.serif,
                      fontSize: 51,
                      color: c.green,
                    }}
                  >
                    {dailyGoal}
                  </Txt>
                  <Txt style={{ color: c.muted, fontSize: 12 }}>
                    {bi("个单词 / 每天", "words / day")}
                  </Txt>
                </View>
                <Txt
                  style={{
                    color: c.muted,
                    fontSize: 11,
                    lineHeight: 22,
                    marginTop: 13,
                  }}
                >
                  {bi(
                    "使用 SM-2 间隔重复算法，根据你的记忆情况，把单词安排在合适的时间再次出现。",
                    "SM-2 spaced repetition brings words back at the right time, based on how well you remember.",
                  )}
                </Txt>
                <Button
                  small
                  secondary
                  style={{ marginTop: 22 }}
                  onPress={() => setGoalOpen(true)}
                >
                  {bi("调整我的计划", "Adjust my plan")}
                </Button>
              </Panel>
            </View>
            <Panel style={{ padding: 25, marginTop: 23 }}>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ gap: 7 }}>
                  <Eyebrow>LOOK HOW FAR YOU’VE GROWN</Eyebrow>
                  <Txt style={{ fontSize: 18, fontFamily: fonts.medium }}>
                    {bi("过去七天", "Your last seven days")}
                  </Txt>
                </View>
                <Sprout size={24} color="#95A67E" strokeWidth={1.3} />
              </View>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  marginTop: 23,
                }}
              >
                {weekReviews.map((day, i) => (
                  <View key={i} style={{ gap: 10, alignItems: "center" }}>
                    <View
                      style={{
                        width: mobile ? 30 : 38,
                        height: mobile ? 30 : 38,
                        borderRadius: 20,
                        backgroundColor: day.count ? c.green : c.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {day.count ? (
                        <Check size={15} color="#fff" />
                      ) : (
                        <Txt style={{ color: "#B2B9A6", fontSize: 11 }}>·</Txt>
                      )}
                    </View>
                    <Txt style={{ color: c.muted, fontSize: 10 }}>
                      {day.date.toLocaleDateString(
                        locale === "zh" ? "zh-CN" : "en-US",
                        { weekday: "short" },
                      )}
                    </Txt>
                    <Txt style={{ color: "#A3AB97", fontSize: 9 }}>
                      {day.count} {bi("词", "words")}
                    </Txt>
                  </View>
                ))}
              </View>
            </Panel>
          </>
        ) : finished ? (
          <Panel
            style={{
              marginTop: 30,
              padding: mobile ? 30 : 60,
              alignItems: "center",
              gap: 21,
            }}
          >
            <View
              style={{
                padding: 24,
                backgroundColor: c.lightGreen,
                borderRadius: 50,
              }}
            >
              <Sprout size={45} color={c.green} strokeWidth={1.2} />
            </View>
            <Eyebrow>A LITTLE MORE ROOTED.</Eyebrow>
            <Txt
              style={{
                fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                fontSize: 29,
                textAlign: "center",
              }}
            >
              {bi(
                "今天的你，又生长了一点。",
                "A little more rooted than before.",
              )}
            </Txt>
            <Txt
              style={{ color: c.muted, textAlign: "center", lineHeight: 25 }}
            >
              {bi(
                `完成了 ${position} 个单词的回顾。\n下一次相遇，已经为你安排好了。`,
                `${position} words revisited.\nYour next reviews are already scheduled.`,
              )}
            </Txt>
            <Button
              icon={Check}
              onPress={() => {
                setSession(null);
                setPosition(0);
              }}
            >
              {bi("查看更新后的回顾计划", "See your updated schedule")}
            </Button>
          </Panel>
        ) : (
          <>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 15,
                marginTop: 30,
                marginBottom: 20,
              }}
            >
              <Txt style={{ color: c.muted, fontSize: 11 }}>
                {position + 1} / {session.length}
              </Txt>
              <View
                style={{
                  flex: 1,
                  height: 4,
                  backgroundColor: "#E4EADB",
                  borderRadius: 3,
                }}
              >
                <View
                  style={{
                    width: `${(position / session.length) * 100}%`,
                    height: 4,
                    backgroundColor: c.green,
                    borderRadius: 3,
                  }}
                />
              </View>
              <IconButton
                icon={X}
                onPress={() => setSession(null)}
                label={bi("退出本次回顾", "Leave review session")}
                size={18}
              />
            </View>
            <Panel
              style={{
                padding: mobile ? 27 : 55,
                alignItems: "center",
                minHeight: 370,
                justifyContent: "center",
              }}
            >
              <Eyebrow>
                {revealed
                  ? bi("每一次理解，都值得珍惜", "A LITTLE MORE UNDERSTOOD")
                  : bi("先试着在心里回忆", "TAKE A MOMENT TO REMEMBER")}
              </Eyebrow>
              <Txt
                style={{
                  fontFamily: fonts.serif,
                  fontSize: mobile ? 43 : 57,
                  marginTop: 30,
                  textAlign: "center",
                }}
              >
                {card!.word}
              </Txt>
              <Txt style={{ color: c.muted, marginTop: 12 }}>
                {dictionary[card!.word]?.phonetic ?? ""}
              </Txt>
              {revealed ? (
                <>
                  <Txt
                    style={{
                      fontSize: 21,
                      color: c.green,
                      marginTop: 30,
                      lineHeight: 34,
                      textAlign: "center",
                    }}
                  >
                    {card!.meaning ||
                      bi(
                        "未填写释义，可在生词本中补充。",
                        "Add a definition from your vocabulary notebook.",
                      )}
                  </Txt>
                  {!!card!.context && (
                    <View
                      style={{
                        backgroundColor: c.bg,
                        borderRadius: 12,
                        padding: 20,
                        marginTop: 25,
                        gap: 11,
                        width: "100%",
                      }}
                    >
                      <Txt
                        style={{
                          fontFamily: fonts.italic,
                          lineHeight: 26,
                          fontSize: 15,
                          textAlign: "center",
                        }}
                      >
                        {card!.context}
                      </Txt>
                      <Txt
                        style={{
                          color: c.green,
                          fontSize: 11,
                          textAlign: "center",
                        }}
                      >
                        {card!.reference}
                      </Txt>
                    </View>
                  )}
                </>
              ) : (
                <Button
                  icon={Eye}
                  secondary
                  onPress={() => setRevealed(true)}
                  style={{ marginTop: 36 }}
                >
                  {bi("揭晓释义", "Reveal meaning")}
                </Button>
              )}
            </Panel>
            {revealed && (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: mobile ? 10 : 15,
                  marginTop: 21,
                }}
              >
                {(
                  [
                    ["again", bi("忘记了", "Again"), "#FAEEEA", "#B47566"],
                    ["hard", bi("有点困难", "Hard"), "#F7F1E5", "#A48A58"],
                    ["good", bi("记得", "Good"), "#EAF0E3", c.green],
                    ["easy", bi("很轻松", "Easy"), "#EAF0F1", c.blue],
                  ] as const
                ).map(([rating, label, bg, color]) => (
                  <Pressable
                    accessibilityRole="button"
                    key={rating}
                    onPress={() => grade(rating)}
                    style={({ pressed }) => ({
                      flex: 1,
                      minWidth: mobile ? "45%" : 100,
                      paddingVertical: 19,
                      borderRadius: 12,
                      alignItems: "center",
                      gap: 8,
                      backgroundColor: bg,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <Txt
                      style={{ color, fontFamily: fonts.bold, fontSize: 15 }}
                    >
                      {label}
                    </Txt>
                    <Txt style={{ color, fontSize: 10 }}>
                      {intervalLabel(rating)}
                    </Txt>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </View>
      <Dialog
        visible={goalOpen}
        onClose={() => setGoalOpen(false)}
        title={bi("找到你的回顾节奏", "Set your daily rhythm")}
      >
        <Txt style={{ color: c.muted, lineHeight: 24, marginBottom: 22 }}>
          {bi(
            "选择每天愿意回顾的单词数量。少一点也没关系，持之以恒更重要。",
            "Choose how many words to review each day. Small and steady is a beautiful place to start.",
          )}
        </Txt>
        <View style={{ flexDirection: "row", gap: 9, flexWrap: "wrap" }}>
          {[5, 10, 15, 20, 30].map((goal) => (
            <Pill
              active={dailyGoal === goal}
              onPress={() => useAppStore.getState().setDailyGoal(goal)}
              key={goal}
            >
              {goal} {bi("词 / 天", "/ day")}
            </Pill>
          ))}
        </View>
        <Button
          style={{ marginTop: 27 }}
          icon={Check}
          onPress={() => setGoalOpen(false)}
        >
          {bi("按这个节奏，慢慢来", "This feels right")}
        </Button>
      </Dialog>
    </ScrollView>
  );
}
