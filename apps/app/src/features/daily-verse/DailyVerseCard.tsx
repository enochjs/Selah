import React, { useState } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import * as Linking from "expo-linking";
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
import { fonts, typeScale } from "../../shared/theme";
import { Eyebrow, Txt } from "../../shared/ui";

const white = "#FAF7EF";
const secondary = "#DCE3D9";

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
  const reference = entry.reference;
  const date = new Date(`${entry.date}T12:00:00`).toLocaleDateString(
    locale === "zh" ? "zh-CN" : "en-US",
    { year: "numeric", month: "long", day: "numeric" },
  );
  const credit = (url: string) => {
    void Linking.openURL(url).catch(() =>
      useAppStore
        .getState()
        .notify(bi("暂时无法打开来源链接", "Unable to open the source link.")),
    );
  };
  return (
    <View
      style={{
        width: "100%",
        borderRadius: 16,
        overflow: "hidden",
        backgroundColor: "#10231B",
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
          "rgba(16,35,27,0.06)",
          "rgba(16,35,27,0.58)",
          "rgba(16,35,27,0.88)",
        ]}
        locations={[0, 0.36, 1]}
        style={{ padding: mobile ? 22 : 32 }}
      >
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <Eyebrow color={white}>
            {stale
              ? bi("最近经文", "Latest Scripture")
              : bi("每日经文", "Daily Scripture")}
          </Eyebrow>
          <Txt style={{ color: secondary, fontSize: typeScale.caption }}>
            {date}
          </Txt>
        </View>
        {stale && (
          <Txt
            style={{
              color: secondary,
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
        <View style={{ marginTop: mobile ? 60 : 64, maxWidth: 760 }}>
          <Txt
            style={{
              fontFamily: primaryLocale === "en" ? fonts.serif : fonts.regular,
              color: white,
              fontSize: mobile ? 18 : 24,
              lineHeight: mobile ? 30 : 38,
            }}
          >
            {passage[primaryLocale]}
          </Txt>
          <Txt
            style={{
              color: secondary,
              fontFamily: otherLocale === "en" ? fonts.serif : fonts.regular,
              fontSize: mobile ? 13 : 15,
              lineHeight: mobile ? 23 : 27,
              marginTop: 18,
            }}
          >
            {passage[otherLocale]}
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
            <Txt style={{ color: secondary, fontSize: typeScale.caption }}>
              {passage.label[locale]} · {bi("读原章", "Read chapter")}
            </Txt>
          </Pressable>
          <View style={{ flexDirection: "row", gap: 4 }}>
            {onArchive && (
              <CardAction
                label={bi("往日经文", "Past days")}
                onPress={onArchive}
              >
                <History size={19} color={white} strokeWidth={1.7} />
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
                    primaryText: passage[primaryLocale],
                    secondaryText: passage[otherLocale],
                    primaryLocale,
                    imageUri,
                    imageAuthor: image.author,
                    imageSourceUrl: image.sourceUrl,
                    imageLicense: image.license,
                    imageLicenseUrl: image.licenseUrl,
                  });
              }}
            >
              <Share2 size={19} color={white} strokeWidth={1.7} />
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
                color={white}
                fill={saved ? white : "none"}
                strokeWidth={1.7}
              />
            </CardAction>
          </View>
        </View>
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            columnGap: 12,
            marginTop: 4,
          }}
        >
          <Txt style={{ color: secondary, fontSize: 11 }}>NIV · 和合本</Txt>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={bi("查看图片来源", "View photograph source")}
            onPress={() => credit(image.sourceUrl)}
            style={{ minHeight: 44, justifyContent: "center", flexShrink: 1 }}
          >
            <Txt style={{ color: secondary, fontSize: 11 }}>
              {bi("摄影", "Photo")} · {image.author} · {bi("已缩放", "Resized")}
            </Txt>
          </Pressable>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={bi("查看图片许可", "View photograph license")}
            onPress={() => credit(image.licenseUrl)}
            style={{ minHeight: 44, justifyContent: "center" }}
          >
            <Txt style={{ color: secondary, fontSize: 11 }}>
              {image.license}
            </Txt>
          </Pressable>
          {!photoAvailable && (
            <Txt style={{ color: secondary, fontSize: 11 }}>
              {bi("图片暂不可用", "Image currently unavailable")}
            </Txt>
          )}
        </View>
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
          selected || hovered ? "rgba(250,247,239,0.16)" : "transparent",
        opacity: disabled ? 0.35 : pressed ? 0.65 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}
