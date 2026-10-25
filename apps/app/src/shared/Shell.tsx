import React, { useEffect, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { Slot, usePathname, router, type Href } from "expo-router";
import {
  BookOpen,
  House,
  Headphones,
  BookMarked,
  Settings,
  Search,
  Globe2,
  Sprout,
  ChevronRight,
  Bookmark,
  X,
} from "lucide-react-native";
import { Brand } from "./Brand";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors as c, fonts, typeScale } from "./theme";
import { Txt, IconButton, Eyebrow } from "./ui";
import { useI18n } from "./i18n";
import { useAppStore } from "../state/app-store";
import { PlayerBar } from "../features/audio/PlayerBar";
import { NowPlayingButton } from "../features/audio/NowPlayingButton";
import { ScriptureSearchDialog } from "../features/reader/ScriptureSearchDialog";
import { SavedVersesDialog } from "../features/reader/SavedVersesDialog";
import { dueWords } from "../domain/vocabulary";
import { ShellActionsContext } from "./shell-actions-context";
import { VocabularyTabs } from "../features/vocabulary/VocabularyTabs";

export function Shell() {
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const pathname = usePathname();
  const vocabularyPage = pathname === "/vocabulary" || pathname === "/review";
  const activePath = vocabularyPage
    ? "/vocabulary"
    : pathname === "/downloads"
      ? "/music"
      : pathname;
  const { bi, locale } = useI18n();
  const [searchOpen, setSearchOpen] = useState(false),
    [bookmarksOpen, setBookmarksOpen] = useState(false);
  const words = useAppStore((s) => s.words),
    bookmarks = useAppStore((s) => s.bookmarks),
    toast = useAppStore((s) => s.toast);
  const compactReader = !desktop && pathname === "/bible";
  const setLocale = useAppStore((s) => s.setLocale),
    notify = useAppStore((s) => s.notify);
  const due = dueWords(words).length;
  const nav = [
    {
      path: "/",
      icon: House,
      zh: "首页",
      en: "Home",
      mobile: "Home",
      tag: "",
    },
    {
      path: "/bible",
      icon: BookOpen,
      zh: "圣经",
      en: "Bible",
      mobile: "Bible",
      tag: "",
    },
    {
      path: "/music",
      icon: Headphones,
      zh: "聆听",
      en: "Listen & worship",
      mobile: "Listen",
      tag: "",
    },
    {
      path: "/vocabulary",
      icon: BookMarked,
      zh: "词汇",
      en: "Vocabulary",
      mobile: "Words",
      tag: due ? `${due}` : "",
    },
  ];
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(null), 3800);
    return () => clearTimeout(timer);
  }, [toast, notify]);
  function openVerse(bookId: string, chapter: number, verse: number) {
    useAppStore.getState().setChapter(bookId, chapter, verse);
    setSearchOpen(false);
    setBookmarksOpen(false);
    router.push("/bible");
  }
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.bg }}
      edges={["top", "left", "right", "bottom"]}
    >
      <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
        {desktop && (
          <View
            style={{
              width: 228,
              backgroundColor: c.sidebar,
              borderRightWidth: 1,
              borderRightColor: c.border,
              paddingHorizontal: 20,
              paddingTop: 33,
            }}
          >
            <View style={{ marginLeft: 7, marginBottom: 46 }}>
              <Brand />
            </View>
            <Eyebrow>{bi("你的安静角落", "YOUR QUIET SPACE")}</Eyebrow>
            <View style={{ gap: 7, marginTop: 20 }}>
              {nav.map(({ icon: Icon, ...n }) => {
                const active = activePath === n.path;
                return (
                  <Pressable
                    key={n.path}
                    accessibilityRole="link"
                    accessibilityLabel={bi(n.zh, n.en)}
                    accessibilityState={{ selected: active }}
                    onPress={() => router.push(n.path as Href)}
                    style={({ hovered }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 15,
                      borderRadius: 10,
                      backgroundColor: active
                        ? c.green
                        : hovered
                          ? "#E8EADD"
                          : "transparent",
                    })}
                  >
                    <Icon
                      size={19}
                      strokeWidth={1.6}
                      color={active ? "#fff" : "#7C8271"}
                    />
                    <Txt
                      style={{
                        color: active ? "#fff" : "#6E7565",
                        fontFamily: active ? fonts.bold : fonts.regular,
                        flex: 1,
                        fontSize: 13,
                      }}
                    >
                      {bi(n.zh, n.en)}
                    </Txt>
                    {!!n.tag && (
                      <View
                        style={{
                          borderRadius: 5,
                          backgroundColor: active ? "#FFFFFF22" : "#E1E5D8",
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                        }}
                      >
                        <Txt
                          style={{
                            fontSize: typeScale.caption,
                            color: active ? "#fff" : c.green,
                          }}
                        >
                          {n.tag}
                        </Txt>
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
            <View
              style={{
                height: 1,
                backgroundColor: "#DFE2D6",
                marginVertical: 27,
              }}
            />
            <Eyebrow>{bi("我的收藏", "YOUR COLLECTION")}</Eyebrow>
            <Pressable
              accessibilityRole="button"
              onPress={() => setBookmarksOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 13,
                padding: 14,
                paddingTop: 20,
              }}
            >
              <Bookmark size={17} color="#7C8271" strokeWidth={1.6} />
              <Txt style={{ color: "#6E7565", fontSize: 13 }}>
                {bi("珍藏的经文", "Saved verses")}
              </Txt>
              <Txt
                style={{
                  color: c.muted,
                  fontSize: typeScale.caption,
                  marginLeft: "auto",
                }}
              >
                {bookmarks.length}
              </Txt>
            </Pressable>
            <View style={{ flex: 1 }} />
            <View
              style={{
                backgroundColor: "#E7EADF",
                padding: 17,
                borderRadius: 12,
                marginBottom: 24,
              }}
            >
              <Sprout size={22} color={c.green} strokeWidth={1.5} />
              <Txt
                style={{
                  fontFamily: fonts.serif,
                  fontSize: 15,
                  lineHeight: 24,
                  marginTop: 12,
                }}
              >
                {bi(
                  "每一天，\n向着光生长。",
                  "Rooted in the Word.\nGrowing every day.",
                )}
              </Txt>
              <Txt
                style={{
                  fontSize: typeScale.caption,
                  color: c.muted,
                  marginTop: 9,
                  lineHeight: 18,
                }}
              >
                {bi(
                  "慢一点，让心灵跟上脚步。",
                  "A little stillness goes a long way.",
                )}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push("/settings")}
              style={{
                flexDirection: "row",
                gap: 12,
                alignItems: "center",
                padding: 12,
                paddingBottom: 28,
              }}
            >
              <Settings size={18} color={c.muted} />
              <Txt style={{ color: c.muted, fontSize: 12 }}>
                {bi("设置", "Settings")}
              </Txt>
              <ChevronRight
                size={13}
                color={c.muted}
                style={{ marginLeft: "auto" }}
              />
            </Pressable>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {!compactReader && (
            <View
              style={{
                height: desktop ? 79 : 64,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: desktop ? 36 : 19,
                backgroundColor: c.bg,
              }}
            >
              {desktop ? (
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
                >
                  <Txt style={{ color: c.muted, fontSize: typeScale.caption }}>
                    {bi("我的空间", "My sanctuary")}
                  </Txt>
                  <ChevronRight size={12} color="#BABCB1" />
                  <Txt
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: typeScale.caption,
                    }}
                  >
                    {pathname === "/downloads"
                      ? bi("离线音频", "Offline audio")
                      : nav.find((n) => n.path === activePath)
                        ? bi(
                            nav.find((n) => n.path === activePath)!.zh,
                            nav.find((n) => n.path === activePath)!.en,
                          )
                        : bi("设置", "Settings")}
                  </Txt>
                </View>
              ) : (
                <Brand small />
              )}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: desktop ? 15 : 1,
                }}
              >
                {desktop ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setSearchOpen(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 10,
                      backgroundColor: "#F0F0E9",
                      borderWidth: 1,
                      borderColor: "#E9E9E0",
                      borderRadius: 8,
                      paddingHorizontal: 13,
                      height: 35,
                      width: width > 1200 ? 234 : 170,
                    }}
                  >
                    <Search size={15} color="#8C9084" />
                    <Txt
                      style={{ color: c.muted, fontSize: typeScale.caption }}
                    >
                      {bi("寻找一句话语…", "Search the Scriptures…")}
                    </Txt>
                  </Pressable>
                ) : (
                  <IconButton
                    icon={Search}
                    onPress={() => setSearchOpen(true)}
                    label={bi("搜索经文", "Search Scripture")}
                  />
                )}
                {pathname !== "/music" && <NowPlayingButton />}
                {!desktop && (
                  <IconButton
                    icon={Bookmark}
                    onPress={() => setBookmarksOpen(true)}
                    label={bi("珍藏的经文", "Saved verses")}
                  />
                )}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={bi("切换为英文", "Switch to Chinese")}
                  onPress={() => setLocale(locale === "zh" ? "en" : "zh")}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    padding: 8,
                  }}
                >
                  <Globe2 size={16} color={c.muted} />
                  {desktop && (
                    <Txt
                      style={{ fontSize: typeScale.caption, color: c.muted }}
                    >
                      {locale === "zh" ? "中文" : "EN"}
                    </Txt>
                  )}
                </Pressable>
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={bi("设置", "Settings")}
                  onPress={() => router.push("/settings")}
                  style={({ hovered, pressed }) => ({
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor:
                      pathname === "/settings"
                        ? c.lightGreen
                        : hovered
                          ? c.sidebar
                          : "transparent",
                    alignItems: "center",
                    justifyContent: "center",
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Settings
                    size={19}
                    strokeWidth={1.7}
                    color={pathname === "/settings" ? c.green : c.muted}
                  />
                </Pressable>
              </View>
            </View>
          )}
          <View style={{ flex: 1, minHeight: 0 }}>
            {vocabularyPage && (
              <VocabularyTabs
                active={pathname === "/review" ? "review" : "words"}
                wordsCount={words.length}
                dueCount={due}
              />
            )}
            <ShellActionsContext.Provider
              value={{
                openSearch: () => setSearchOpen(true),
                openBookmarks: () => setBookmarksOpen(true),
                dialogOpen: searchOpen || bookmarksOpen,
              }}
            >
              <Slot />
            </ShellActionsContext.Provider>
          </View>
          {pathname === "/music" && <PlayerBar />}
          {!desktop && (
            <View
              style={{
                flexDirection: "row",
                backgroundColor: c.paper,
                paddingBottom: 3,
                borderTopWidth: 1,
                borderTopColor: c.border,
              }}
            >
              {nav.map(({ icon: Icon, ...n }) => (
                <Pressable
                  accessibilityRole="link"
                  accessibilityLabel={bi(n.zh, n.mobile)}
                  accessibilityState={{ selected: activePath === n.path }}
                  key={n.path}
                  onPress={() => router.push(n.path as Href)}
                  style={{
                    flex: 1,
                    alignItems: "center",
                    paddingTop: 11,
                    paddingBottom: 7,
                    gap: 5,
                  }}
                >
                  <Icon
                    size={20}
                    color={activePath === n.path ? c.green : "#969A8D"}
                    strokeWidth={activePath === n.path ? 2 : 1.5}
                  />
                  <Txt
                    style={{
                      fontSize: typeScale.caption,
                      color: activePath === n.path ? c.green : c.muted,
                    }}
                  >
                    {bi(n.zh, n.mobile)}
                  </Txt>
                </Pressable>
              ))}
            </View>
          )}
        </View>
      </View>
      {toast && (
        <View
          style={{
            position: "absolute",
            bottom: desktop ? 120 : 180,
            left: desktop ? 260 : 18,
            right: 18,
            alignItems: "center",
            pointerEvents: "box-none",
          }}
        >
          <Pressable
            onPress={() => notify(null)}
            style={{
              flexDirection: "row",
              gap: 15,
              maxWidth: 520,
              backgroundColor: c.darkGreen,
              paddingHorizontal: 22,
              paddingVertical: 15,
              borderRadius: 12,
              boxShadow: "0 5px 25px #0002",
            }}
          >
            <Txt style={{ color: "#fff", fontSize: 12, flexShrink: 1 }}>
              {toast}
            </Txt>
            <X size={15} color="#fff" />
          </Pressable>
        </View>
      )}
      <ScriptureSearchDialog
        visible={searchOpen}
        onClose={() => setSearchOpen(false)}
        onOpenVerse={openVerse}
      />
      <SavedVersesDialog
        visible={bookmarksOpen}
        onClose={() => setBookmarksOpen(false)}
        onOpenVerse={openVerse}
        onOpenReader={() => router.push("/bible")}
      />
    </SafeAreaView>
  );
}
