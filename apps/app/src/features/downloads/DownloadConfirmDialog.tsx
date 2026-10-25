import React from "react";
import { Pressable, View, useWindowDimensions } from "react-native";
import { Download, Wifi } from "lucide-react-native";
import type { Locale } from "../../domain/models";
import type { DownloadPlan } from "../../domain/offline-audio";
import { useI18n } from "../../shared/i18n";
import { colors as c, fonts, typeScale } from "../../shared/theme";
import { Button, Dialog, Txt } from "../../shared/ui";
import { bytesLabel } from "./download-format";

export interface DownloadCandidate {
  plan: DownloadPlan;
  label: string;
  locale: Locale;
}
interface DownloadConfirmDialogProps {
  candidate: DownloadCandidate | null;
  busy: boolean;
  error: string | null;
  wifiOnly: boolean;
  onWifiOnly: (value: boolean) => void;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}
export function DownloadConfirmDialog({
  candidate,
  busy,
  error,
  wifiOnly,
  onWifiOnly,
  onConfirm,
  onClose,
}: DownloadConfirmDialogProps) {
  const { bi } = useI18n();
  const { width } = useWindowDimensions();
  const insufficient =
    candidate !== null &&
    candidate.plan.availableBytes !== null &&
    candidate.plan.bytes > candidate.plan.availableBytes;
  return (
    <Dialog
      visible={candidate !== null}
      onClose={onClose}
      title={bi("确认下载", "Confirm download")}
      presentation={width < 900 ? "bottom" : "center"}
      dismissible={!busy}
      footer={
        candidate && (
          <View
            style={{
              padding: 16,
              gap: 8,
              borderTopWidth: 1,
              borderColor: c.border,
            }}
          >
            <View
              style={{ flexDirection: width < 480 ? "column" : "row", gap: 8 }}
            >
              <Button
                secondary
                disabled={busy}
                onPress={onClose}
                style={width < 480 ? undefined : { flex: 1 }}
              >
                {bi("取消", "Cancel")}
              </Button>
              <Button
                icon={Download}
                disabled={busy || insufficient}
                onPress={onConfirm}
                style={width < 480 ? undefined : { flex: 2 }}
              >
                {busy
                  ? bi("正在添加…", "Adding…")
                  : candidate.plan.bytes === 0
                    ? bi("保存到离线音频", "Keep offline")
                    : bi("开始下载", "Start download")}
              </Button>
            </View>
          </View>
        )
      }
    >
      {candidate && (
        <View style={{ gap: 18 }}>
          <View style={{ gap: 6 }}>
            <Txt
              style={{ fontFamily: fonts.medium, fontSize: 17, lineHeight: 25 }}
            >
              {candidate.label}
            </Txt>
            <Txt style={{ color: c.muted, fontSize: typeScale.label }}>
              {candidate.locale === "en" ? "English · NIV" : "中文 · 和合本"} ·{" "}
              {candidate.plan.chapters.length} {bi("章", "chapters")}
            </Txt>
          </View>
          <View
            style={{
              backgroundColor: c.lightGreen,
              padding: 18,
              borderRadius: 12,
              gap: 6,
            }}
          >
            <Txt style={{ color: c.green, fontSize: typeScale.label }}>
              {bi("本次需下载", "To download")}
            </Txt>
            <Txt
              style={{
                color: c.darkGreen,
                fontFamily: fonts.bold,
                fontSize: 32,
              }}
            >
              {bytesLabel(candidate.plan.bytes)}
            </Txt>
            {candidate.plan.bytes === 0 && (
              <Txt style={{ color: c.green, lineHeight: 22 }}>
                {bi(
                  "音频文件已保存在本机，无需再次下载。",
                  "Audio files are already saved on this device. No download is needed.",
                )}
              </Txt>
            )}
          </View>
          <View style={{ gap: 10 }}>
            <Txt style={{ fontSize: typeScale.label }}>
              {bi("完整音频总量", "Total audio")} ·{" "}
              {bytesLabel(candidate.plan.totalBytes)}
            </Txt>
            <Txt style={{ color: c.muted, fontSize: typeScale.label }}>
              {bi("可用存储空间", "Available storage")} ·{" "}
              {candidate.plan.availableBytes === null
                ? bi("未知（暂时无法读取）", "Unknown (currently unavailable)")
                : bytesLabel(candidate.plan.availableBytes)}
            </Txt>
            {insufficient && (
              <Txt
                accessibilityLiveRegion="polite"
                style={{ color: c.red, lineHeight: 22 }}
              >
                {bi(
                  "空间不足，请释放空间或选择较小范围。",
                  "Not enough space. Free up storage or choose a smaller selection.",
                )}
              </Txt>
            )}
          </View>
          <View style={{ gap: 6 }}>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityLabel={bi(
                "仅 Wi-Fi 下载",
                "Download over Wi-Fi only",
              )}
              accessibilityState={{ checked: wifiOnly, disabled: busy }}
              disabled={busy}
              onPress={() => onWifiOnly(!wifiOnly)}
              style={{
                flexDirection: "row",
                minHeight: 44,
                minWidth: 44,
                alignItems: "center",
                gap: 10,
                paddingVertical: 10,
              }}
            >
              <View
                style={{
                  width: 23,
                  height: 23,
                  borderWidth: 1,
                  borderColor: c.green,
                  borderRadius: 5,
                  backgroundColor: wifiOnly ? c.green : c.paper,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Txt style={{ color: c.paper }}>{wifiOnly ? "✓" : ""}</Txt>
              </View>
              <Wifi size={18} color={c.green} />
              <Txt style={{ flex: 1, fontSize: typeScale.body }}>
                {bi("仅 Wi-Fi 下载", "Download over Wi-Fi only")}
              </Txt>
            </Pressable>
            <Txt
              style={{
                fontSize: typeScale.caption,
                color: wifiOnly ? c.muted : c.textGold,
                lineHeight: 20,
              }}
            >
              {wifiOnly
                ? bi(
                    "未连接 Wi-Fi 时，下载会等待连接。",
                    "Downloads will wait until Wi-Fi is available.",
                  )
                : bi(
                    "可能使用移动数据，请留意流量。",
                    "Downloads may use mobile data.",
                  )}
            </Txt>
          </View>
          {error && (
            <Txt
              accessibilityLiveRegion="polite"
              style={{ color: c.red, lineHeight: 22 }}
            >
              {error}
            </Txt>
          )}
        </View>
      )}
    </Dialog>
  );
}
