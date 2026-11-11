import React, { useEffect, useRef, useState, type ComponentType } from "react";
import { ActivityIndicator, View } from "react-native";
import {
  Check,
  Download,
  Pause,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react-native";
import type { AudioTrack } from "../../domain/models";
import { DownloadFailure } from "../../domain/download-manager";
import { useI18n } from "../../shared/i18n";
import { colors as c } from "../../shared/theme";
import { Button, Dialog, IconButton, Txt } from "../../shared/ui";
import { useOfflineAudio } from "./OfflineAudioProvider";
import {
  DownloadConfirmDialog,
  type DownloadCandidate,
} from "./DownloadConfirmDialog";

export interface HymnDownloadControlProps {
  label: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}

export function HymnDownloadButton<ControlProps extends object = object>({
  track,
  manage = false,
  targetWidth = 44,
  Control,
  controlProps,
}: {
  track: AudioTrack;
  manage?: boolean;
  targetWidth?: number;
  Control?: ComponentType<ControlProps & HymnDownloadControlProps>;
  controlProps?: ControlProps;
}) {
  const { bi } = useI18n();
  const offline = useOfflineAudio();
  const [candidate, setCandidate] = useState<DownloadCandidate | null>(null);
  const [managing, setManaging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [wifiOnly, setWifiOnly] = useState(offline.state.wifiOnly);
  const running = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hymn = track.hymn;
  // Bundled examples and previous local recordings already work offline.
  if (!hymn || typeof track.source === "number") return null;
  const key = `hymn:${hymn.id}`;
  const saved = offline.state.chapters[key];
  const entry =
    saved?.kind === "hymn" && saved.hymn.audioPath === hymn.audioPath
      ? saved
      : undefined;
  const status = entry?.status;
  const active =
    status === "downloading" || status === "queued" || status === "waiting";
  const run = async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (failure) {
      if (mounted.current)
        setError(
          failure instanceof DownloadFailure && failure.code === "storage"
            ? bi(
                "存储空间不足或无法保存，请释放空间后重试。",
                "Could not save audio. Free up storage and retry.",
              )
            : bi(
                "暂时无法准备下载或保存更改，请检查网络与存储后重试。",
                "Could not download or save changes. Check your connection and storage, then retry.",
              ),
        );
    } finally {
      running.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const prepare = () =>
    run(async () => {
      const plan = await offline.prepareHymn(hymn);
      if (mounted.current) {
        setWifiOnly(offline.state.wifiOnly);
        setCandidate({ plan, label: track.title });
      }
    });
  const label =
    manage && status !== "complete"
      ? bi(`管理下载 ${track.title}`, `Manage download ${track.title}`)
      : status === "complete"
        ? bi(
            `${track.title} 已下载 · 管理下载`,
            `${track.title} downloaded · Manage download`,
          )
        : active
          ? bi(`暂停下载 ${track.title}`, `Pause download ${track.title}`)
          : status === "paused"
            ? bi(`继续下载 ${track.title}`, `Resume download ${track.title}`)
            : status === "failed"
              ? bi(`重试下载 ${track.title}`, `Retry download ${track.title}`)
              : bi(`下载 ${track.title}`, `Download ${track.title}`);
  const file = entry?.files[0];
  const icon =
    status === "complete"
      ? Check
      : active
        ? Pause
        : status === "paused"
          ? Play
          : status === "failed"
            ? RefreshCw
            : Download;
  const onPress = () => {
    if (manage || status === "complete") setManaging(true);
    else if (active) return run(() => offline.pause([key]));
    else if (status === "paused" || status === "failed")
      return run(() => offline.resume([key]));
    else return prepare();
  };
  const percent = file
    ? Math.min(
        100,
        Math.floor(
          ((offline.state.transfers[file.path] ?? 0) / file.size) * 100,
        ),
      )
    : 0;
  return (
    <>
      {Control && controlProps ? (
        <Control
          {...controlProps}
          label={label}
          disabled={!offline.state.ready}
          busy={busy}
          onPress={() => {
            void onPress();
          }}
        />
      ) : (
        <View style={{ alignItems: "center" }}>
          {busy ? (
            <View
              style={{
                width: targetWidth,
                height: 44,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <ActivityIndicator
                color={c.green}
                accessibilityLabel={bi("正在准备下载", "Preparing download")}
              />
            </View>
          ) : (
            <IconButton
              targetWidth={targetWidth}
              size={targetWidth < 44 ? 18 : 19}
              icon={icon}
              label={label}
              active={status === "complete" || active}
              disabled={!offline.state.ready}
              onPress={onPress}
            />
          )}
          {active && (
            <Txt style={{ fontSize: 10, color: c.green }}>
              {status === "waiting" ? bi("等待网络", "Waiting") : `${percent}%`}
            </Txt>
          )}
        </View>
      )}
      <DownloadConfirmDialog
        candidate={candidate}
        busy={busy}
        error={error}
        wifiOnly={wifiOnly}
        onWifiOnly={setWifiOnly}
        onClose={() => {
          if (!running.current) {
            setCandidate(null);
            setError(null);
          }
        }}
        onConfirm={() =>
          run(async () => {
            if (!candidate) return;
            await offline.enqueue(candidate.plan, wifiOnly);
            if (mounted.current) setCandidate(null);
          })
        }
      />
      <Dialog
        visible={managing || (error !== null && candidate === null)}
        title={
          managing
            ? bi("管理下载", "Manage download")
            : bi("诗歌下载", "Song download")
        }
        dismissible={!busy}
        onClose={() => {
          if (!running.current) {
            setManaging(false);
            setError(null);
          }
        }}
      >
        <View style={{ gap: 16 }}>
          <Txt style={{ fontSize: 17 }}>{track.title}</Txt>
          {managing && (
            <Txt style={{ color: c.muted, lineHeight: 22 }}>
              {status === "complete"
                ? bi(
                    "已保存在本机，可离线播放。移除后将在线聆听，收藏和歌单会保留。",
                    "Saved for offline listening. Removing the download keeps your favorites and playlists.",
                  )
                : bi(
                    "下载尚未完成。移除会清理本地文件，收藏和歌单会保留。",
                    "The download is unfinished. Removing it clears local files and keeps your favorites and playlists.",
                  )}
            </Txt>
          )}
          {error && (
            <Txt
              accessibilityLiveRegion="polite"
              style={{ color: c.red, lineHeight: 22 }}
            >
              {error}
            </Txt>
          )}
          {managing && active && (
            <Button
              disabled={busy}
              icon={Pause}
              onPress={() => run(() => offline.pause([key]))}
            >
              {bi("暂停下载", "Pause download")}
            </Button>
          )}
          {managing && (status === "paused" || status === "failed") && (
            <Button
              disabled={busy}
              icon={Play}
              onPress={() => run(() => offline.resume([key]))}
            >
              {bi("继续 / 重试", "Resume / retry")}
            </Button>
          )}
          {managing ? (
            <Button
              secondary
              icon={Trash2}
              disabled={busy}
              onPress={() =>
                run(async () => {
                  await offline.remove([key]);
                  if (mounted.current) setManaging(false);
                })
              }
            >
              {bi("移除下载", "Remove download")}
            </Button>
          ) : (
            <Button disabled={busy} onPress={() => void prepare()}>
              {bi("重试", "Retry")}
            </Button>
          )}
        </View>
      </Dialog>
    </>
  );
}
