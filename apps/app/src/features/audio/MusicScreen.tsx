import React, { useRef, useState } from "react";
import {
  View,
  ScrollView,
  ImageBackground,
  Pressable,
  useWindowDimensions,
  ActivityIndicator,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Play, Plus, Music2, Heart, Cloud } from "lucide-react-native";
import { useAudio } from "./AudioProvider";
import { useHymnCatalog } from "./useHymns";
import { useCloudPlaylists } from "./useCloudPlaylists";
import { HymnList } from "./HymnList";
import { LegacySongsPanel } from "./LegacySongsPanel";
import { MusicLibraryDialogs } from "./MusicLibraryDialogs";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { Txt, Button, Panel } from "../../shared/ui";
import { colors as c, fonts, images } from "../../shared/theme";
import type { MusicLibraryAction } from "./MusicLibraryDialogs";

export function MusicScreen() {
  const { bi, locale } = useI18n();
  const audio = useAudio();
  const mobile = useWindowDimensions().width < 760;
  const hymnCatalog = useHymnCatalog(locale);
  const catalog = hymnCatalog.tracks;
  const cloud = useCloudPlaylists();
  const favorites = useAppStore((s) => s.favoriteHymns);
  const playlists = useAppStore((s) => s.musicPlaylists);
  const [action, setAction] = useState<MusicLibraryAction | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const listRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const browseOffset = useRef(0);
  function browse() {
    setAction(null);
    listRef.current?.scrollTo({ y: browseOffset.current, animated: true });
  }
  async function refresh() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    try {
      await Promise.all([hymnCatalog.refresh(), cloud.refresh()]);
    } finally {
      refreshingRef.current = false;
      setRefreshing(false);
    }
  }
  const firstQueue =
    cloud.items[0]?.hymnIds.flatMap(
      (id) => catalog.find((track) => track.id === id) ?? [],
    ) ?? [];
  const heroQueue = firstQueue.length ? firstQueue : catalog;
  return (
    <>
      <ScrollView
        ref={listRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: mobile ? 20 : 35, paddingBottom: 45 }}
      >
        <View
          style={{
            maxWidth: 1100,
            alignSelf: "center",
            width: "100%",
            gap: 24,
          }}
        >
          <ImageBackground
            source={images.morning}
            imageStyle={{ borderRadius: 18 }}
            style={{
              minHeight: mobile ? 166 : 220,
              borderRadius: 18,
              overflow: "hidden",
            }}
          >
            <LinearGradient
              colors={["#263D32CC", "#263D3222"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={{
                flex: 1,
                padding: mobile ? 20 : 32,
                justifyContent: "center",
                gap: 12,
              }}
            >
              <Txt
                style={{ color: "#FFFFFFBB", fontSize: 12, letterSpacing: 2 }}
              >
                SELAH · {bi("诗歌时光", "A MOMENT OF PRAISE")}
              </Txt>
              <Txt
                style={{
                  fontFamily: locale === "en" ? fonts.serif : fonts.regular,
                  fontSize: mobile ? 23 : 32,
                  color: "#fff",
                }}
              >
                {bi("让心，在赞美中安静。", "Quiet melodies.")}
              </Txt>
              <Button
                small
                icon={Play}
                secondary
                disabled={!heroQueue.length}
                onPress={() => audio.playQueue(heroQueue)}
                style={{
                  alignSelf: "flex-start",
                  backgroundColor: "#F6F7F0",
                }}
              >
                {heroQueue.length
                  ? firstQueue.length
                    ? bi("播放推荐歌单", "Play featured playlist")
                    : bi("播放平台诗歌", "Play hymns")
                  : bi("暂无可用的平台诗歌", "No platform hymns available")}
              </Button>
            </LinearGradient>
          </ImageBackground>
          {(cloud.status === "offline" || hymnCatalog.status === "offline") && (
            <Panel style={{ padding: 16, gap: 12 }}>
              <Txt
                accessibilityRole="alert"
                style={{ color: c.muted, lineHeight: 22 }}
              >
                {cloud.status === "offline"
                  ? bi(
                      "云歌单暂时无法更新，请检查网络后重试。",
                      "Cloud playlists could not be updated. Check your connection and retry.",
                    )
                  : bi(
                      "平台诗歌暂时无法更新，请检查网络后重试。",
                      "Hymns could not be updated. Check your connection and retry.",
                    )}
              </Txt>
              <Button small secondary disabled={refreshing} onPress={refresh}>
                {refreshing
                  ? bi("正在重试…", "Retrying…")
                  : bi("重试", "Retry")}
              </Button>
            </Panel>
          )}
          <View
            onLayout={(event) => {
              browseOffset.current = event.nativeEvent.layout.y;
            }}
            style={{ gap: 12 }}
          >
            <Txt
              accessibilityRole="header"
              style={{ fontSize: 18, fontFamily: fonts.medium }}
            >
              {bi("平台诗歌", "Explore hymns")}
            </Txt>
            {catalog.length ? (
              <HymnList
                hymns={catalog}
                catalog={catalog}
                onAdd={(hymn) => setAction({ kind: "add", hymn })}
              />
            ) : (
              <Txt style={{ color: c.muted }}>
                {bi("暂无可用的平台诗歌", "No platform hymns available")}
              </Txt>
            )}
          </View>
          {(cloud.items.length > 0 || cloud.status === "loading") && (
            <View style={{ gap: 12 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 9 }}
              >
                <Cloud size={20} color={c.green} />
                <Txt
                  accessibilityRole="header"
                  style={{ fontSize: 18, fontFamily: fonts.medium }}
                >
                  {bi("云歌单", "Cloud playlists")}
                </Txt>
              </View>
              <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 21 }}>
                {bi(
                  "为你挑选的赞美诗歌，遇见喜欢的旋律就收藏。",
                  "Explore curated hymns and save the songs you love.",
                )}
              </Txt>
              {cloud.status === "loading" && (
                <ActivityIndicator
                  color={c.green}
                  accessibilityLabel={bi("正在加载云歌单", "Loading playlists")}
                />
              )}
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 14 }}>
                {cloud.items.map((playlist) => {
                  const title =
                    locale === "zh" ? playlist.titleZh : playlist.titleEn;
                  return (
                    <Pressable
                      key={playlist.id}
                      accessibilityRole="button"
                      accessibilityLabel={bi(
                        `打开歌单 ${title}`,
                        `Open playlist ${title}`,
                      )}
                      onPress={() =>
                        setAction({
                          kind: "details",
                          selection: { kind: "cloud", id: playlist.id },
                        })
                      }
                      style={{
                        flexGrow: 1,
                        flexBasis: mobile ? "45%" : "28%",
                        maxWidth: mobile ? "100%" : 350,
                        borderRadius: 14,
                        overflow: "hidden",
                        backgroundColor: c.sidebar,
                      }}
                    >
                      <ImageBackground
                        source={images[playlist.cover]}
                        style={{ minHeight: 142 }}
                      >
                        <LinearGradient
                          colors={["#263D3200", "#263D32BB"]}
                          style={{
                            minHeight: 142,
                            padding: 17,
                            justifyContent: "flex-end",
                            gap: 7,
                          }}
                        >
                          <Txt
                            style={{
                              color: "#fff",
                              fontFamily: fonts.medium,
                              fontSize: 17,
                            }}
                          >
                            {title}
                          </Txt>
                          <Txt style={{ color: "#FFFFFFCC", fontSize: 12 }}>
                            {bi(
                              `${playlist.hymnIds.length} 首歌曲`,
                              `${playlist.hymnIds.length} songs`,
                            )}
                          </Txt>
                        </LinearGradient>
                      </ImageBackground>
                      <Txt
                        numberOfLines={2}
                        style={{
                          padding: 14,
                          color: c.muted,
                          fontSize: 12,
                          lineHeight: 20,
                        }}
                      >
                        {locale === "zh"
                          ? playlist.descriptionZh
                          : playlist.descriptionEn}
                      </Txt>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <Panel style={{ padding: mobile ? 16 : 24, gap: 12 }}>
            <View
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              <Txt
                accessibilityRole="header"
                style={{ fontSize: 18, fontFamily: fonts.medium }}
              >
                {bi("我的音乐", "My music")}
              </Txt>
              <Button
                secondary
                small
                icon={Plus}
                onPress={() => setAction({ kind: "edit", name: "" })}
              >
                {bi("新建歌单", "New playlist")}
              </Button>
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={bi("打开我喜欢的", "Open liked songs")}
              onPress={() =>
                setAction({ kind: "details", selection: { kind: "favorites" } })
              }
              style={{
                minHeight: 64,
                flexDirection: "row",
                gap: 14,
                alignItems: "center",
                padding: 14,
                borderRadius: 12,
                backgroundColor: c.lightGreen,
              }}
            >
              <Heart size={25} color={c.green} />
              <View style={{ gap: 6, flex: 1 }}>
                <Txt style={{ fontFamily: fonts.medium, fontSize: 16 }}>
                  {bi("我喜欢的", "Liked songs")}
                </Txt>
                <Txt style={{ color: c.muted, fontSize: 12 }}>
                  {favorites.length
                    ? bi(
                        `${favorites.length} 首歌曲`,
                        `${favorites.length} songs`,
                      )
                    : bi("收藏喜欢的诗歌", "Save the songs you love")}
                </Txt>
              </View>
            </Pressable>
            {playlists.map((playlist) => (
              <Pressable
                key={playlist.id}
                accessibilityRole="button"
                accessibilityLabel={bi(
                  `打开歌单 ${playlist.name}`,
                  `Open playlist ${playlist.name}`,
                )}
                onPress={() =>
                  setAction({
                    kind: "details",
                    selection: { kind: "personal", id: playlist.id },
                  })
                }
                style={{
                  minHeight: 64,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 14,
                  borderTopWidth: 1,
                  borderColor: c.border,
                  paddingVertical: 10,
                }}
              >
                <Music2 size={22} color={c.green} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Txt style={{ fontFamily: fonts.medium }}>
                    {playlist.name}
                  </Txt>
                  <Txt style={{ color: c.muted, fontSize: 12 }}>
                    {bi(
                      `${playlist.hymns.length} 首歌曲`,
                      `${playlist.hymns.length} songs`,
                    )}
                  </Txt>
                </View>
              </Pressable>
            ))}
          </Panel>
          <LegacySongsPanel />
          <Txt style={{ color: c.muted, fontSize: 12, lineHeight: 20 }}>
            {bi(
              "平台诗歌由内容中心提供；内置钢琴示例根据公版旋律生成。收藏不会自动下载音频。",
              "Hymns are provided by our content library. Bundled piano examples use public-domain melodies. Saving a song does not download its audio.",
            )}
          </Txt>
        </View>
      </ScrollView>
      <MusicLibraryDialogs
        action={action}
        setAction={setAction}
        catalog={catalog}
        cloudPlaylists={cloud.items}
        onBrowse={browse}
      />
    </>
  );
}
