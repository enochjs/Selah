import React from "react";
import { View } from "react-native";
import { Pause, Play } from "lucide-react-native";
import type { HymnDownload } from "../../domain/offline-audio";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts } from "../../shared/theme";
import { IconButton, Panel, Txt } from "../../shared/ui";
import { useAudio } from "../audio/AudioProvider";
import { hymns } from "../audio/catalog";
import { useOfflineAudio } from "./OfflineAudioProvider";
import { HymnDownloadButton } from "./HymnDownloadButton";
import { bytesLabel } from "./download-format";

export function OfflineHymnsSection() {
  const { bi, locale } = useI18n();
  const { state } = useOfflineAudio();
  const audio = useAudio();
  const entries = Object.values(state.chapters).filter(
    (entry): entry is HymnDownload => entry.kind === "hymn",
  );
  if (!entries.length) return null;
  const tracks = hymns(
    locale,
    entries.map((entry) => entry.hymn),
  );
  const readyTracks = tracks.filter((track) =>
    entries.some(
      (entry) => entry.hymn.id === track.id && entry.status === "complete",
    ),
  );
  return (
    <Panel style={{ padding: 18, gap: 12 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <Txt style={{ fontFamily: fonts.medium, fontSize: 17 }}>
          {bi("诗歌下载", "Downloaded songs")}
        </Txt>
        <Txt style={{ color: c.muted, fontSize: 12 }}>
          {entries.filter((entry) => entry.status === "complete").length} /{" "}
          {entries.length} {bi("首已下载", "songs saved")}
        </Txt>
      </View>
      {entries.map((entry) => {
        const track = tracks.find((item) => item.id === entry.hymn.id);
        if (!track) return null;
        const current = audio.track?.id === track.id;
        const status = {
          complete: bi("离线可用", "Available offline"),
          downloading: bi("正在下载", "Downloading"),
          queued: bi("排队中", "Queued"),
          waiting:
            state.network === "offline"
              ? bi("等待联网", "Waiting for connection")
              : bi("等待 Wi-Fi", "Waiting for Wi-Fi"),
          paused: bi("已暂停", "Paused"),
          failed:
            entry.error === "storage"
              ? bi("存储空间不足", "Not enough storage")
              : entry.error === "integrity"
                ? bi(
                    "文件校验失败，请重试",
                    "Verification failed. Retry download",
                  )
                : bi("下载失败，请重试", "Download failed. Retry"),
        }[entry.status];
        return (
          <View
            key={entry.key}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              borderTopWidth: 1,
              borderColor: c.border,
              paddingTop: 12,
            }}
          >
            <IconButton
              icon={current && audio.playing ? Pause : Play}
              disabled={entry.status !== "complete"}
              label={
                current && audio.playing
                  ? bi(`暂停 ${track.title}`, `Pause ${track.title}`)
                  : bi(`离线播放 ${track.title}`, `Play ${track.title} offline`)
              }
              onPress={() => {
                if (current) audio.toggle();
                else
                  audio.playQueue(
                    readyTracks,
                    readyTracks.findIndex((item) => item.id === track.id),
                  );
              }}
            />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Txt
                numberOfLines={2}
                style={{ fontFamily: fonts.medium, lineHeight: 22 }}
              >
                {track.title}
              </Txt>
              <Txt
                style={{
                  color: entry.status === "failed" ? c.red : c.muted,
                  fontSize: 12,
                  lineHeight: 19,
                }}
              >
                {status} ·{" "}
                {bytesLabel(
                  entry.files.reduce((sum, file) => sum + file.size, 0),
                )}
              </Txt>
            </View>
            <HymnDownloadButton track={track} manage />
          </View>
        );
      })}
    </Panel>
  );
}
