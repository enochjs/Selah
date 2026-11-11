import React, { useState } from "react";
import { Image, Pressable, View, useWindowDimensions } from "react-native";
import { ChevronRight } from "lucide-react-native";
import type {
  DailyVerseCatalog,
  DailyVerseEntry,
} from "@selah/content/daily-verses";
import { bibleRepository } from "../../data/bible-repository";
import { dailyArchive, dailyPassage } from "../../domain/daily-verse";
import type { DailyVerseSharePayload } from "../../domain/daily-verse-sharing";
import { Dialog, Button, Txt } from "../../shared/ui";
import { colors, fonts } from "../../shared/theme";
import { useI18n } from "../../shared/i18n";
import { DailyVerseCard } from "./DailyVerseCard";
import { useDailyVerseImage } from "./useDailyVerse";
import { formatDailyVerseText } from "./format-scripture";

export function DailyVerseArchiveDialog({
  visible,
  onClose,
  onDismiss,
  catalog,
  today,
  onShare,
}: {
  visible: boolean;
  onClose: () => void;
  onDismiss?: () => void;
  catalog: DailyVerseCatalog;
  today: string;
  onShare: (payload: DailyVerseSharePayload) => void;
}) {
  const { bi, locale } = useI18n();
  const mobile = useWindowDimensions().width < 760;
  const [selected, setSelected] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const entries = dailyArchive(catalog, today);
  const entry = entries.find((item) => item.id === selected);
  const index = entry ? entries.indexOf(entry) : -1;
  const image = catalog.images.find((image) => image.id === entry?.imageId);
  const imageUri = useDailyVerseImage(entry?.imageId);
  return (
    <Dialog
      visible={visible}
      onClose={onClose}
      onDismiss={onDismiss}
      title={bi("往日经文", "Past days")}
      presentation={mobile ? "bottom" : "center"}
      width={760}
      heightMode="large"
    >
      {entry && image ? (
        <View style={{ gap: 16 }}>
          <Button secondary onPress={() => setSelected(null)}>
            {bi("返回日期列表", "Back to dates")}
          </Button>
          <DailyVerseCard
            entry={entry}
            image={image}
            imageUri={imageUri}
            onShare={onShare}
            onOpenChapter={onClose}
          />
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <Button
              secondary
              disabled={index >= entries.length - 1}
              onPress={() => setSelected(entries[index + 1].id)}
            >
              {bi("更早一期", "Earlier day")}
            </Button>
            <Button
              secondary
              disabled={index <= 0}
              onPress={() => setSelected(entries[index - 1].id)}
            >
              {bi("更新一期", "Later day")}
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ gap: 8 }}>
          <Txt
            style={{ color: colors.muted, lineHeight: 23, marginBottom: 10 }}
          >
            {bi("重读曾经停留过的话语。", "Return to words worth keeping.")}
          </Txt>
          {entries.slice(0, limit).map((item) => (
            <ArchiveRow
              key={item.id}
              entry={item}
              onPress={() => setSelected(item.id)}
            />
          ))}
          {!entries.length && (
            <Txt>{bi("还没有往日经文", "No past Scripture yet.")}</Txt>
          )}
          {entries.length > limit && (
            <Button secondary onPress={() => setLimit(limit + 20)}>
              {bi("查看更早经文", "Show earlier days")}
            </Button>
          )}
          <Txt style={{ color: colors.muted, fontSize: 12, marginTop: 12 }}>
            {bi(`共 ${entries.length} 期`, `${entries.length} published days`)}{" "}
            ·{" "}
            {new Date(`${today}T12:00:00`).toLocaleDateString(
              locale === "zh" ? "zh-CN" : "en-US",
            )}
          </Txt>
        </View>
      )}
    </Dialog>
  );
}

function ArchiveRow({
  entry,
  onPress,
}: {
  entry: DailyVerseEntry;
  onPress: () => void;
}) {
  const { locale } = useI18n();
  const passage = dailyPassage(entry.reference, bibleRepository);
  const imageUri = useDailyVerseImage(entry.imageId);
  if (!passage) return null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${entry.date} · ${passage.label[locale]}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        gap: 14,
        alignItems: "center",
        borderRadius: 12,
        padding: 12,
        backgroundColor: colors.sidebar,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <View
        style={{
          width: 62,
          height: 72,
          borderRadius: 8,
          backgroundColor: colors.lightGreen,
          overflow: "hidden",
        }}
      >
        {imageUri && (
          <Image
            source={{ uri: imageUri }}
            style={{ width: "100%", height: "100%" }}
            resizeMode="cover"
          />
        )}
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        <Txt style={{ color: colors.muted, fontSize: 12 }}>{entry.date}</Txt>
        <Txt style={{ fontFamily: fonts.medium, fontSize: 14 }}>
          {passage.label[locale]}
        </Txt>
        <Txt numberOfLines={1} style={{ color: colors.muted, fontSize: 12 }}>
          {formatDailyVerseText(passage[locale], locale)}
        </Txt>
      </View>
      <ChevronRight size={17} color={colors.muted} />
    </Pressable>
  );
}
