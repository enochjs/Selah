import React, { useRef, useState } from "react";
import { View } from "react-native";
import { router } from "expo-router";
import { Download } from "lucide-react-native";
import { DownloadFailure } from "../../domain/download-manager";
import type { PublishedHymn } from "../../domain/hymns";
import type { AudioTrack } from "../../domain/models";
import { useI18n } from "../../shared/i18n";
import { useTheme } from "../../shared/theme-context";
import { Button, Txt } from "../../shared/ui";
import { useAppStore } from "../../state/app-store";
import {
  DownloadConfirmDialog,
  type DownloadCandidate,
} from "./DownloadConfirmDialog";
import { useOfflineAudio } from "./OfflineAudioProvider";

export function useHymnBatchDownload(tracks: AudioTrack[], label: string) {
  const offline = useOfflineAudio();
  const { bi } = useI18n();
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [candidate, setCandidate] = useState<DownloadCandidate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wifiOnly, setWifiOnly] = useState(offline.state.wifiOnly);
  const running = useRef(false);

  const eligible = new Map<string, PublishedHymn>();
  if (offline.state.ready)
    for (const track of tracks) {
      const hymn = track.hymn;
      if (!hymn || typeof track.source === "number") continue;
      const entry = offline.state.chapters[`hymn:${hymn.id}`];
      if (
        entry?.kind === "hymn" &&
        entry.hymn.audioPath === hymn.audioPath &&
        entry.status !== "paused" &&
        entry.status !== "failed"
      )
        continue;
      eligible.set(track.id, hymn);
    }
  const selection = [...eligible].filter(([id]) => selected?.has(id));
  const allSelected =
    selection.length > 0 && selection.length === eligible.size;

  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(
        failure instanceof DownloadFailure && failure.code === "storage"
          ? bi(
              "存储空间不足，请释放空间后重试。",
              "Free up storage and try again.",
            )
          : bi(
              "暂时无法添加下载，请检查网络与存储后重试。",
              "Could not add downloads. Check your connection and storage, then retry.",
            ),
      );
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return {
    eligible,
    selected,
    allSelected,
    count: selection.length,
    busy,
    error,
    candidate,
    wifiOnly,
    setWifiOnly,
    start: () => setSelected(new Set()),
    cancel: () => {
      if (running.current) return;
      setError(null);
      setSelected(null);
    },
    toggleAll: () =>
      setSelected(allSelected ? new Set() : new Set(eligible.keys())),
    toggle: (id: string) => {
      setSelected((previous) => {
        if (!previous) return previous;
        const next = new Set(previous);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    prepare: () =>
      run(async () => {
        if (!selection.length) return;
        const { plan, skipped } = await offline.prepareHymns(
          selection.map(([, hymn]) => hymn),
        );
        setWifiOnly(offline.state.wifiOnly);
        setCandidate({ plan, skipped, label });
      }),
    close: () => {
      if (running.current) return;
      setCandidate(null);
      setError(null);
    },
    confirm: () =>
      run(async () => {
        if (!candidate) return;
        await offline.enqueue(candidate.plan, wifiOnly);
        setCandidate(null);
        setSelected(null);
        useAppStore
          .getState()
          .notify(bi("已添加到下载队列", "Added to the download queue"), {
            label: bi("查看下载", "View downloads"),
            run: () => router.push("/music/downloads"),
          });
      }),
  };
}

export function HymnBatchDownloadControls({
  batch,
  gutter,
}: {
  batch: ReturnType<typeof useHymnBatchDownload>;
  gutter: number;
}) {
  const { colors: c } = useTheme();
  const { bi } = useI18n();
  if (!batch.selected && !batch.eligible.size) return null;
  return (
    <View style={{ paddingHorizontal: gutter, paddingBottom: 8, gap: 8 }}>
      {batch.selected ? (
        <View
          style={{
            flexDirection: "row",
            flexWrap: "wrap",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Button
            small
            secondary
            disabled={!batch.eligible.size || batch.busy}
            onPress={batch.toggleAll}
          >
            {batch.allSelected
              ? bi("取消全选", "Clear all")
              : bi("全选", "Select all")}
          </Button>
          <Txt
            accessibilityLiveRegion="polite"
            style={{ flexGrow: 1, color: c.textMuted }}
          >
            {bi(`已选 ${batch.count} 首`, `${batch.count} selected`)}
          </Txt>
          <Button
            small
            icon={Download}
            disabled={!batch.count || batch.busy}
            onPress={batch.prepare}
          >
            {batch.busy && !batch.candidate
              ? bi("正在准备…", "Preparing…")
              : bi("下载所选", "Download selected")}
          </Button>
        </View>
      ) : (
        <Button
          small
          secondary
          icon={Download}
          style={{ alignSelf: "flex-start" }}
          onPress={batch.start}
        >
          {bi("批量下载", "Batch download")}
        </Button>
      )}
      {batch.error && !batch.candidate && (
        <Txt accessibilityLiveRegion="polite" style={{ color: c.danger }}>
          {batch.error}
        </Txt>
      )}
      <DownloadConfirmDialog
        candidate={batch.candidate}
        busy={batch.busy}
        error={batch.error}
        wifiOnly={batch.wifiOnly}
        onWifiOnly={batch.setWifiOnly}
        onClose={batch.close}
        onConfirm={batch.confirm}
      />
    </View>
  );
}
