import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Pressable, useWindowDimensions } from "react-native";
import { Tabs, usePathname, router, type Href } from "expo-router";
import {
  BookOpen,
  House,
  Headphones,
  UserRound,
  Search,
  Sprout,
  ChevronRight,
  X,
} from "lucide-react-native";
import { Brand } from "./Brand";
import { SafeAreaView } from "react-native-safe-area-context";
import { fonts, typeScale } from "./theme";
import { useTheme } from "./theme-context";
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
import { UpdateReminder } from "../features/updates/UpdateReminder";

export function Shell() {
  const { colors: c } = useTheme();
  const { width } = useWindowDimensions();
  const desktop = width >= 900;
  const pathname = usePathname();
  const musicPage = pathname === "/music" || pathname.startsWith("/music/");
  const musicSearch = pathname === "/music/search";
  const musicSubpage = musicPage && pathname !== "/music";
  const playerPage =
    pathname === "/now-playing" || pathname === "/english-lesson";
  const englishPage = pathname === "/english";
  const vocabularyPage = pathname === "/vocabulary" || pathname === "/review";
  const personalPage = [
    "/me",
    "/vocabulary",
    "/review",
    "/downloads",
    "/settings",
    "/about",
    "/updates",
    "/english",
    "/english-lesson",
  ].includes(pathname);
  const activePath = personalPage ? "/me" : musicPage ? "/music" : pathname;
  const { bi } = useI18n();
  const searchLabel = bi("搜索经文", "Search Scripture");
  const [searchOpen, setSearchOpen] = useState(false),
    [bookmarksOpen, setBookmarksOpen] = useState(false);
  const words = useAppStore((s) => s.words),
    toast = useAppStore((s) => s.toast);
  const toastAction = useAppStore((s) => s.toastAction);
  const compactReader = !desktop && pathname === "/bible";
  const readerChromeHidden = useAppStore((s) => s.readerChromeHidden);
  const hideReaderNavigation = compactReader && readerChromeHidden;
  const showTopBar =
    !compactReader &&
    !playerPage &&
    !musicSearch &&
    (desktop || !musicSubpage);
  const setReaderChromeHidden = useAppStore((s) => s.setReaderChromeHidden);
  useEffect(() => {
    if (pathname !== "/bible") setReaderChromeHidden(false);
  }, [pathname, setReaderChromeHidden]);
  const notify = useAppStore((s) => s.notify);
  const due = dueWords(words).length;
  const openBookmarks = useCallback(() => setBookmarksOpen(true), []);
  const shellActions = useMemo(
    () => ({
      openBookmarks,
      dialogOpen: searchOpen || bookmarksOpen,
    }),
    [openBookmarks, searchOpen, bookmarksOpen],
  );
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
      path: "/me",
      icon: UserRound,
      zh: "我的",
      en: "My space",
      mobile: "Me",
      tag: "",
    },
  ];
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => notify(null), 3800);
    return () => clearTimeout(timer);
  }, [toast, toastAction, notify]);
  function openVerse(bookId: string, chapter: number, verse: number) {
    useAppStore.getState().setChapter(bookId, chapter, verse);
    setSearchOpen(false);
    setBookmarksOpen(false);
    router.push("/bible");
  }
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: c.background }}
      edges={
        desktop || playerPage || musicSearch
          ? ["top", "left", "right", "bottom"]
          : ["top", "left", "right"]
      }
    >
      <View style={{ flex: 1, flexDirection: "row", overflow: "hidden" }}>
        {desktop && !playerPage && (
          <View
            style={{
              width: 228,
              backgroundColor: c.surfaceMuted,
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
                    onPress={() => {
                      if (pathname !== n.path) router.navigate(n.path as Href);
                    }}
                    style={({ hovered, pressed }) => ({
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 13,
                      paddingHorizontal: 14,
                      paddingVertical: 15,
                      borderRadius: 14,
                      backgroundColor: active
                        ? c.primarySoft
                        : hovered
                          ? c.border
                          : "transparent",
                      opacity: pressed ? 0.65 : 1,
                    })}
                  >
                    <Icon
                      size={19}
                      strokeWidth={1.6}
                      color={active ? c.primaryStrong : c.textMuted}
                    />
                    <Txt
                      style={{
                        color: active ? c.primaryStrong : c.textMuted,
                        fontFamily: active ? fonts.bold : fonts.regular,
                        flex: 1,
                        fontSize: 14,
                      }}
                    >
                      {bi(n.zh, n.en)}
                    </Txt>
                    {!!n.tag && (
                      <View
                        style={{
                          borderRadius: 5,
                          backgroundColor: c.primarySoft,
                          paddingVertical: 2,
                          paddingHorizontal: 6,
                        }}
                      >
                        <Txt
                          style={{
                            fontSize: typeScale.caption,
                            color: c.primary,
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
            <View style={{ flex: 1 }} />
            <View
              style={{
                backgroundColor: c.primarySoft,
                padding: 17,
                borderRadius: 12,
                marginBottom: 24,
              }}
            >
              <Sprout size={22} color={c.primary} strokeWidth={1.5} />
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
                  color: c.textMuted,
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
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0 }}>
          {showTopBar && (
            <View
              style={{
                height: desktop ? 79 : 64,
                borderBottomWidth: 1,
                borderBottomColor: c.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: desktop ? 36 : 19,
                backgroundColor: c.background,
              }}
            >
              {desktop ? (
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Txt
                    style={{
                      color: c.textMuted,
                      fontSize: typeScale.caption,
                    }}
                  >
                    {bi("我的空间", "My sanctuary")}
                  </Txt>
                  <ChevronRight size={12} color={c.textMuted} />
                  <Txt
                    style={{
                      fontFamily: fonts.medium,
                      fontSize: typeScale.caption,
                    }}
                  >
                    {pathname === "/vocabulary" || pathname === "/review"
                      ? bi("我的词汇", "My vocabulary")
                      : englishPage
                        ? bi("情境英语", "English in context")
                        : pathname === "/settings"
                          ? bi("设置", "Settings")
                          : pathname === "/updates"
                            ? bi("应用更新", "App updates")
                            : pathname === "/about"
                              ? bi("关于与版权", "About & credits")
                              : pathname === "/downloads"
                                ? bi("离线音频", "Offline audio")
                                : nav.find((n) => n.path === activePath)
                                  ? bi(
                                      nav.find((n) => n.path === activePath)!
                                        .zh,
                                      nav.find((n) => n.path === activePath)!
                                        .en,
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
                {pathname === "/" &&
                  (desktop ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={searchLabel}
                      onPress={() => setSearchOpen(true)}
                      style={({ hovered, pressed }) => ({
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 10,
                        backgroundColor: hovered ? c.primarySoft : c.surface,
                        borderWidth: 1,
                        borderColor: c.border,
                        borderRadius: 12,
                        paddingHorizontal: 13,
                        minHeight: 44,
                        width: width > 1200 ? 234 : 170,
                        opacity: pressed ? 0.65 : 1,
                      })}
                    >
                      <Search size={17} color={c.textMuted} />
                      <Txt
                        style={{
                          color: c.textMuted,
                          fontSize: typeScale.label,
                          flexShrink: 1,
                        }}
                      >
                        {bi("寻找一句话语…", "Search the Scriptures…")}
                      </Txt>
                    </Pressable>
                  ) : (
                    <IconButton
                      icon={Search}
                      onPress={() => setSearchOpen(true)}
                      label={searchLabel}
                    />
                  ))}
                <NowPlayingButton scriptureOnly={musicPage} />
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
            <ShellActionsContext.Provider value={shellActions}>
              <Tabs
                backBehavior="history"
                detachInactiveScreens
                tabBar={() => null}
                screenOptions={{
                  headerShown: false,
                  lazy: true,
                  freezeOnBlur: true,
                  animation: "none",
                  sceneStyle: { backgroundColor: c.background },
                }}
              >
                <Tabs.Screen name="index" />
                <Tabs.Screen name="bible" />
                <Tabs.Screen name="music" />
                <Tabs.Screen name="now-playing" />
                <Tabs.Screen
                  name="media-playback"
                  options={{ freezeOnBlur: false }}
                />
                <Tabs.Screen name="me" />
                <Tabs.Screen name="english" />
                <Tabs.Screen
                  name="english-lesson"
                  options={{ freezeOnBlur: false }}
                />
                <Tabs.Screen name="about" />
                <Tabs.Screen name="vocabulary" />
                {/* The custom navigation above/below controls visible entries.
                    Expo 58 redirects href:null (hidden) routes away on navigation. */}
                <Tabs.Screen name="review" />
                <Tabs.Screen name="settings" />
                <Tabs.Screen name="updates" options={{ freezeOnBlur: false }} />
                <Tabs.Screen
                  name="downloads"
                  options={{ freezeOnBlur: false }}
                />
              </Tabs>
            </ShellActionsContext.Provider>
          </View>
          {musicPage && <PlayerBar />}
          {!desktop && !hideReaderNavigation && !playerPage && !musicSearch && (
            <SafeAreaView
              edges={["bottom"]}
              style={{
                position: compactReader ? "absolute" : "relative",
                bottom: 0,
                left: 0,
                right: 0,
                zIndex: 20,
                flexDirection: "row",
                backgroundColor: c.surface,
                paddingBottom: 0,
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
                  onPress={() => {
                    if (pathname !== n.path) router.navigate(n.path as Href);
                  }}
                  style={({ pressed }) => ({
                    flex: 1,
                    minHeight: 64,
                    alignItems: "center",
                    justifyContent: "center",
                    paddingVertical: 8,
                    gap: 6,
                    opacity: pressed ? 0.65 : 1,
                  })}
                >
                  <Icon
                    size={22}
                    color={
                      activePath === n.path ? c.primaryStrong : c.textMuted
                    }
                    strokeWidth={activePath === n.path ? 2 : 1.5}
                  />
                  <Txt
                    style={{
                      fontSize: typeScale.caption,
                      color:
                        activePath === n.path ? c.primaryStrong : c.textMuted,
                      fontFamily:
                        activePath === n.path ? fonts.bold : fonts.regular,
                    }}
                  >
                    {bi(n.zh, n.mobile)}
                  </Txt>
                </Pressable>
              ))}
            </SafeAreaView>
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
            accessibilityRole="button"
            accessibilityLabel={
              toastAction ? `${toast} · ${toastAction.label}` : toast
            }
            onPress={() => {
              notify(null);
              toastAction?.run();
            }}
            style={{
              flexDirection: "row",
              gap: 15,
              maxWidth: 520,
              backgroundColor: c.primaryStrong,
              paddingHorizontal: 22,
              paddingVertical: 15,
              borderRadius: 12,
              boxShadow: c.floatingShadow,
            }}
          >
            <Txt
              style={{ color: c.onPrimaryStrong, fontSize: 12, flexShrink: 1 }}
            >
              {toast}
            </Txt>
            {toastAction ? (
              <Txt
                style={{
                  color: c.onPrimaryStrong,
                  fontFamily: fonts.bold,
                  textDecorationLine: "underline",
                }}
              >
                {toastAction.label}
              </Txt>
            ) : (
              <X size={15} color={c.onPrimaryStrong} />
            )}
          </Pressable>
        </View>
      )}
      <ScriptureSearchDialog
        visible={searchOpen && !musicPage}
        onClose={() => setSearchOpen(false)}
        onOpenVerse={openVerse}
      />
      <UpdateReminder dialogOpen={searchOpen || bookmarksOpen} />
      <SavedVersesDialog
        visible={bookmarksOpen}
        onClose={() => setBookmarksOpen(false)}
        onOpenVerse={openVerse}
        onOpenReader={() => router.push("/bible")}
      />
    </SafeAreaView>
  );
}
