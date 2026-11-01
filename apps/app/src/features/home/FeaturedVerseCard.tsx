import React from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bookmark } from "lucide-react-native";
import { bibleRepository } from "../../data/bible-repository";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors, fonts, images, typeScale } from "../../shared/theme";
import { Eyebrow, Txt } from "../../shared/ui";

const reference = { bookId: "john", chapter: 8, verse: 12 };
const bookmarkKey = `${reference.bookId}:${reference.chapter}:${reference.verse}`;
const warmWhite = "#FAF7EF";
const secondaryWhite = "#DCE3D9";

export function FeaturedVerseCard() {
  const mobile = useWindowDimensions().width < 760;
  const { bi, locale } = useI18n();
  const saved = useAppStore((state) => state.bookmarks.includes(bookmarkKey));
  const book = bibleRepository.getBook(reference.bookId);
  const verse = bibleRepository
    .getChapter(reference.bookId, reference.chapter)
    .find((item) => item.number === reference.verse);

  if (!verse) return null;

  return (
    <View
      style={{
        width: "100%",
        borderRadius: 15,
        overflow: "hidden",
        backgroundColor: "#10231B",
      }}
    >
      <Image
        source={images.lake}
        resizeMode="cover"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
        }}
      />
      <LinearGradient
        colors={[
          "rgba(16,35,27,0.18)",
          "rgba(16,35,27,0.70)",
          "rgba(16,35,27,0.96)",
        ]}
        locations={[0, 0.5, 1]}
        style={{ padding: mobile ? 24 : 32 }}
      >
        <Eyebrow color={warmWhite}>{bi("精选经文", "Featured verse")}</Eyebrow>
        <View style={{ marginTop: mobile ? 72 : 88, maxWidth: 740 }}>
          <Txt
            style={{
              fontFamily: locale === "en" ? fonts.serif : fonts.regular,
              color: warmWhite,
              fontSize: mobile ? 18 : 24,
              lineHeight: mobile ? 31 : 38,
            }}
          >
            {bi(verse.zh, verse.en)}
          </Txt>
          <Txt
            style={{
              color: secondaryWhite,
              fontSize: mobile ? typeScale.caption : typeScale.body,
              lineHeight: mobile ? 21 : 24,
              marginTop: 18,
            }}
          >
            {bi(verse.en, verse.zh)}
          </Txt>
        </View>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 24,
            gap: 12,
          }}
        >
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
              flexShrink: 1,
            })}
            onPress={() => {
              useAppStore
                .getState()
                .setChapter(
                  reference.bookId,
                  reference.chapter,
                  reference.verse,
                );
              router.push("/bible");
            }}
          >
            <Txt style={{ color: secondaryWhite, fontSize: typeScale.caption }}>
              {bi(book.zh, book.en)} {reference.chapter}:{reference.verse}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              saved
                ? bi("取消收藏精选经文", "Unsave featured verse")
                : bi("收藏精选经文", "Save featured verse")
            }
            accessibilityState={{ selected: saved }}
            onPress={() => useAppStore.getState().toggleBookmark(bookmarkKey)}
            style={({ hovered, pressed }) => ({
              width: 44,
              height: 44,
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor:
                saved || hovered ? "rgba(250,247,239,0.16)" : "transparent",
              opacity: pressed ? 0.65 : 1,
            })}
          >
            <Bookmark
              size={18}
              color={warmWhite}
              fill={saved ? warmWhite : "none"}
              strokeWidth={1.7}
            />
          </Pressable>
        </View>
      </LinearGradient>
    </View>
  );
}
