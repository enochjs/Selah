import React, { useState } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Bookmark, History, Share2 } from "lucide-react-native";
import type {
  DailyVerseEntry,
  DailyVerseImage,
} from "@selah/content/daily-verses";
import { bibleRepository } from "../../data/bible-repository";
import { dailyPassage, passageBookmarkKeys } from "../../domain/daily-verse";
import type { DailyVerseSharePayload } from "../../domain/daily-verse-sharing";
import { useAppStore } from "../../state/app-store";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Eyebrow, Txt } from "../../shared/ui";
import { formatDailyVerseText } from "./format-scripture";

export function DailyVerseCard({
  entry,
  image,
  imageUri,
  stale = false,
  onArchive,
  onShare,
  onOpenChapter,
}: {
  entry: DailyVerseEntry;
  image: DailyVerseImage;
  imageUri?: string;
  stale?: boolean;
  onArchive?: () => void;
  onShare: (payload: DailyVerseSharePayload) => void;
  onOpenChapter?: () => void;
}) {
  const mobile = useWindowDimensions().width < 760;
  const { bi, locale } = useI18n();
  const primaryLocale = useAppStore((state) => state.primaryLocale) ?? locale;
  const bookmarks = useAppStore((state) => state.bookmarks);
  const passage = dailyPassage(entry.reference, bibleRepository);
  const keys = passageBookmarkKeys(entry.reference);
  const saved = keys.every((key) => bookmarks.includes(key));
  const [failedUri, setFailedUri] = useState<string | undefined>();
  const photoAvailable = Boolean(imageUri && failedUri !== imageUri);
  if (!passage) return null;
  const otherLocale = primaryLocale === "zh" ? "en" : "zh";
  const primaryText = formatDailyVerseText(passage[primaryLocale], primaryLocale);
  const secondaryText = formatDailyVerseText(passage[otherLocale], otherLocale);
  const reference = entry.reference;
  const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
  return (
    <View
      style={{
        width: "100%",
        flexGrow: 1,
        borderRadius: 20,
        overflow: "hidden",
        backgroundColor: c.scriptureBackdrop,
      }}
    >
      {photoAvailable && (
        <Image
          key={imageUri}
          source={{ uri: imageUri }}
          accessibilityIgnoresInvertColors
          onError={() => setFailedUri(imageUri)}
          resizeMode="cover"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        />
      )}
      <LinearGradient
        colors={[
          "rgba(16,35,27,0.68)",
          "rgba(16,35,27,0.72)",
          "rgba(16,35,27,0.94)",
        ]}
        locations={[0, 0.36, 1]}
        style={{ padding: mobile ? 20 : 28, flexGrow: 1 }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Eyebrow color={c.onScripture}>
            {stale
              ? bi("最近经文", "Latest Scripture")
              : bi("每日经文", "Daily Scripture")}
          </Eyebrow>
          <Txt
            style={{ color: c.onScriptureMuted, fontSize: typeScale.caption }}
          >
            {date}
          </Txt>
        </View>
        {stale && (
          <Txt
            style={{
              color: c.onScriptureMuted,
              fontSize: typeScale.caption,
              lineHeight: 21,
              marginTop: 12,
            }}
          >
            {bi(
              "今日内容暂不可用，以下为最近一期经文。",
              "Today’s content is unavailable. Showing the most recent dated Scripture.",
            )}
          </Txt>
        )}
        <View
          style={{ marginTop: mobile ? 36 : 48, maxWidth: 760, flexGrow: 1 }}
        >
          <Txt
            style={{
              fontFamily:
                primaryLocale === "en" ? fonts.serif : fonts.scriptureZh,
              color: c.onScripture,
              fontSize: mobile ? 21 : 25,
              lineHeight: mobile ? 34 : 39,
            }}
          >
            {primaryText}
          </Txt>
          <Txt
            style={{
              color: c.onScriptureMuted,
              fontFamily: otherLocale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 14 : 15,
              lineHeight: mobile ? 24 : 27,
              marginTop: 16,
            }}
          >
            {secondaryText}
          </Txt>
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: 8,
            marginTop: 18,
            paddingTop: 12,
            borderTopWidth: 1,
            borderTopColor: c.scriptureDivider,
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bi(
              `阅读${passage.label.zh}原章`,
              `Read ${passage.label.en} in its chapter`,
            )}
            onPress={() => {
              onOpenChapter?.();
              useAppStore
                .getState()
                .setChapter(
                  reference.bookId,
                  reference.chapter,
                  reference.verse,
                );
              router.push("/bible");
            }}
            style={({ pressed }) => ({
              minHeight: 44,
              justifyContent: "center",
              opacity: pressed ? 0.65 : 1,
              flexShrink: 1,
            })}
          >
            <Txt
              style={{ color: c.onScriptureMuted, fontSize: typeScale.label }}
            >
              {passage.label[locale]} · {bi("读原章", "Read chapter")}
            </Txt>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {onArchive && (
              <CardAction
                label={bi("往日经文", "Past days")}
                onPress={onArchive}
              >
                <History size={19} color={c.onScripture} strokeWidth={1.7} />
              </CardAction>
            )}
            <CardAction
              label={bi("分享经文图片", "Share Scripture image")}
              disabled={!photoAvailable}
              onPress={() => {
                if (imageUri)
                  onShare({
                    date: entry.date,
                    reference: passage.label[primaryLocale],
                    primaryText,
                    secondaryText,
                    primaryLocale,
                    imageUri,
                    imageAuthor: image.author,
                    imageSourceUrl: image.sourceUrl,
                    imageLicense: image.license,
                    imageLicenseUrl: image.licenseUrl,
                  });
              }}
            >
              <Share2 size={19} color={c.onScripture} strokeWidth={1.7} />
            </CardAction>
            <CardAction
              label={
                saved
                  ? bi("取消收藏每日经文", "Unsave daily Scripture")
                  : bi("收藏每日经文", "Save daily Scripture")
              }
              selected={saved}
              onPress={() => {
                for (const key of keys)
                  if (saved || !bookmarks.includes(key))
                    useAppStore.getState().toggleBookmark(key);
              }}
            >
              <Bookmark
                size={19}
                color={c.onScripture}
                fill={saved ? c.onScripture : "none"}
                strokeWidth={1.7}
              />
            </CardAction>
          </View>
        </View>
        {!photoAvailable && (
          <Txt
            style={{
              color: c.onScriptureMuted,
              fontSize: typeScale.caption,
              marginTop: 4,
            }}
          >
            {bi("图片暂不可用", "Image currently unavailable")}
          </Txt>
        )}
      </LinearGradient>
    </View>
  );
}

function CardAction({
  children,
  label,
  onPress,
  selected = false,
  disabled = false,
}: React.PropsWithChildren<{
  label: string;
  onPress: () => void;
  selected?: boolean;
  disabled?: boolean;
}>) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 12,
        backgroundColor:
          selected || hovered ? c.scriptureAction : "transparent",
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
