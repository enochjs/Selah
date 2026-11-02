import React, { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import {
  useDailyVerse,
  useDailyVerseImage,
} from "../daily-verse/useDailyVerse";
import { DailyVerseCard } from "../daily-verse/DailyVerseCard";
import { DailyVerseArchiveDialog } from "../daily-verse/DailyVerseArchiveDialog";
import { ShareDailyVerseDialog } from "../daily-verse/ShareDailyVerseDialog";
import {
  captureDailyShare,
  resolveDailyShare,
  type DailyShareSession,
} from "../../domain/daily-verse-share-session";
import { useI18n } from "../../shared/i18n";
import { Panel, Txt } from "../../shared/ui";

export function FeaturedVerseCard() {
  const daily = useDailyVerse();
  const imageUri = useDailyVerseImage(daily.entry?.imageId);
  const { bi } = useI18n();
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveMounted, setArchiveMounted] = useState(false);
  const pendingShare = useRef<DailyShareSession | null>(null);
  const [share, setShare] = useState<DailyShareSession | null>(null);
  const catalogRef = useRef(daily.catalog);
  const sharePayload = resolveDailyShare(share, daily.catalog);
  if (share && !sharePayload) setShare(null);
  useEffect(() => {
    catalogRef.current = daily.catalog;
    if (
      pendingShare.current &&
      !resolveDailyShare(pendingShare.current, daily.catalog)
    )
      pendingShare.current = null;
  }, [daily.catalog]);
  const image = daily.catalog.images.find(
    (image) => image.id === daily.entry?.imageId,
  );
  return (
    <View>
      {daily.entry && image ? (
        <DailyVerseCard
          entry={daily.entry}
          image={image}
          imageUri={imageUri}
          stale={daily.stale}
          onArchive={() => {
            setArchiveMounted(true);
            setArchiveOpen(true);
          }}
          onShare={(payload) =>
            setShare(captureDailyShare(payload, daily.catalog))
          }
        />
      ) : (
        <Panel style={{ padding: 24, gap: 12 }}>
          <Txt>{bi("每日经文", "Daily Scripture")}</Txt>
          <Txt>
            {bi(
              "今日内容正在准备，稍后回来看看。",
              "Today’s Scripture is being prepared. Please check back soon.",
            )}
          </Txt>
        </Panel>
      )}
      {archiveMounted && (
        <DailyVerseArchiveDialog
          visible={archiveOpen}
          onClose={() => setArchiveOpen(false)}
          onDismiss={() => {
            setArchiveMounted(false);
            if (resolveDailyShare(pendingShare.current, catalogRef.current))
              setShare(pendingShare.current);
            pendingShare.current = null;
          }}
          catalog={daily.catalog}
          today={daily.today}
          onShare={(payload) => {
            pendingShare.current = captureDailyShare(payload, daily.catalog);
            setArchiveOpen(false);
          }}
        />
      )}
      {sharePayload && (
        <ShareDailyVerseDialog
          visible
          payload={sharePayload}
          onClose={() => setShare(null)}
        />
      )}
    </View>
  );
}
